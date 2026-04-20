from __future__ import annotations
import asyncio
import json
import time
import base64
from typing import Any, Dict, List, Optional, Tuple
import websockets
from websockets.asyncio.server import serve, ServerConnection
from websockets.asyncio.client import connect, ClientConnection
from rich.console import Console
from loguru import logger
import httpx


from .p2p import parse_join_link, sha256_hex_bytes
from .utils import new_id, is_colab
from .pieces import split_pieces, piece_hashes
from .services import BaseService, HFService, ServiceError
from .nat import try_upnp_map
from .nat import auto_port_forward, try_stun, get_public_ip
from .registry import RegistryClient

# In Colab/Jupyter, rich auto-detects HTML output which often buffers or fails in subprocesses.
# We force terminal mode to ensure we get raw text streaming.
console_kwargs = {}
if is_colab():
    console_kwargs = {"force_terminal": True, "force_interactive": False}

console = Console(**console_kwargs)


class P2PNode:
    def __init__(self, host: str = "0.0.0.0", port: int = 4001, announce_host: Optional[str] = None, announce_port: Optional[int] = None, entrypoint_url: Optional[str] = None, region: str = "Auto"):
        self.host = host
        self.port = port
        self.announce_host = announce_host
        self.announce_port = announce_port
        self.peer_id = new_id("peer")
        self.registry = RegistryClient(entrypoint_url=entrypoint_url)
        self.region = region
        
        # We'll set self.addr after start() once we know the port
        self.addr = "" 
        self.server: Optional[websockets.asyncio.server.Server] = None
        
        # State
        self.peers: Dict[str, Dict[str, Any]] = {}  # pid -> {ws, addr, last_pong_ms}
        self.local_services: Dict[str, BaseService] = {}  # svc_name -> ServiceInstance
        self.providers: Dict[str, Dict[str, Any]] = {}  # pid -> {svc_name: metadata}
        self.pieces: Dict[str, Dict[str, Any]] = {}  # content_hash -> blob_info
        
        self._lock = asyncio.Lock()
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._running = False
        self._monitor_active = False

    async def enable_monitoring(self, interval_seconds: int = 300):
        """Enable the supervisor monitoring loop."""
        if self._monitor_active:
            return
        self._monitor_active = True
        asyncio.create_task(self._monitoring_loop(interval_seconds))
        console.print(f"[bold magenta]👁️ Supervisor Monitoring Enabled (Interval: {interval_seconds}s)[/bold magenta]")

    async def _monitoring_loop(self, interval: int):
        while self._monitor_active and self._running:
            try:
                await self._run_health_checks()
                if self.registry.enabled:
                    await self.sync_with_registry()
            except Exception as e:
                logger.error(f"Monitoring Error: {e}")
            await asyncio.sleep(interval)

    async def sync_with_registry(self):
        """Register/Update this node in the global Supabase directory."""
        if not self.addr or not self.registry.enabled:
            return
        
        from .utils import get_system_metrics
        metrics = get_system_metrics()
        
        models = []
        for svc in self.local_services.values():
            meta = svc.get_metadata()
            if "models" in meta:
                models.extend(meta["models"])
            elif "model" in meta:
                models.append(meta["model"])
        
        # Deduplicate and sync
        await self.registry.sync_node(
            peer_id=self.peer_id,
            address=self.addr,
            models=list(set(models)),
            tag="pypi-production",
            region=self.region,
            metrics=metrics
        )

    async def _run_health_checks(self):
        from .utils import now_ms, get_system_metrics
        timestamp = now_ms()
        peers_to_check = list(self.peers.items())
        
        # Collect local metrics once to send to everyone
        local_metrics = get_system_metrics()
        
        # Only log if we have peers to avoid spam
        if len(peers_to_check) > 0:
            logger.info(f"Running Health Check on {len(peers_to_check)} peers...")
        
        for pid, peer_data in peers_to_check:
            ws = peer_data.get("ws")
            # Handle different websockets versions (some don't have .closed)
            is_closed = getattr(ws, "closed", False) or not getattr(ws, "open", True)
            if not ws or is_closed:
                logger.warning(f"Peer {pid} connection appears closed")
                continue
                
            # 1. Latency Check (Ping)
            t0 = time.time()
            try:
                logger.debug(f"Sending ping to {pid} with metrics")
                # Send ping with metrics
                await self._send(ws, {
                    "type": "ping", 
                    "ts": t0, # Note: using 'ts' as expected by pong handler
                    "metrics": local_metrics
                })
                
                # Update peer metadata
                self.peers[pid]["last_audit"] = timestamp
                self.peers[pid]["health_status"] = "online"
                
                # Check providers validity (simple heuristic)
                if pid in self.providers:
                    self.providers[pid]["last_audit"] = timestamp
                    self.providers[pid]["health"] = "good" 
                    
            except Exception as e:
                console.log(f"[red]Ping failed to {pid}: {e}[/red]")
                self.peers[pid]["health_status"] = "unreachable"
                if pid in self.providers:
                    self.providers[pid]["health"] = "degraded"

    async def start(self):
        logger.info(f"Starting P2P Node on {self.host}:{self.port}")
        
        async def handler(ws: WebSocketServerProtocol):
            await self._handle_connection(ws)

        try:
            self.server = await websockets.serve(handler, self.host, self.port, max_size=32 * 1024 * 1024)
            self._running = True
            logger.success("WebSocket server started successfully")
        except Exception as e:
            logger.error(f"Failed to start WebSocket server: {e}")
            raise

        # Resolve actual port if 0
        if self.port == 0:
            self.port = self.server.sockets[0].getsockname()[1]
            logger.info(f"OS assigned port: {self.port}")

        # Resolve announce address
        # If announce_host is set, use it.
        # Else if host is 0.0.0.0, try to detect LAN IP.
        # Else use host.
        if self.announce_host:
            display_host = self.announce_host
            logger.info(f"Using announce_host: {display_host}")
        elif self.host == "0.0.0.0":
            from .utils import get_lan_ip
            display_host = get_lan_ip()
            logger.info(f"Detected LAN IP: {display_host}")

            # Try UPnP only if we are on 0.0.0.0 (likely local dev / home router)
            console.log(f"[dim]Attempting Auto Port Forwarding for port {self.port}...[/dim]")
            
            try:
                # Try port forwarding
                console.log(f"[debug] Calling auto_port_forward({self.port}, 'TCP')")
                forward_result = await auto_port_forward(self.port, "TCP")

                if forward_result and forward_result.success:
                    if forward_result.method == "UPnP":
                        console.log(f"[green]✅ UPnP Success:[/green] Port {self.port} mapped")
                    else:
                        console.log(f"[green]✅ {forward_result.method} Success:[/green]")

                    display_host = forward_result.external_ip
                    console.log(f"[cyan]External IP detected: {display_host}[/cyan]")

                    if forward_result.external_port != self.port:
                        logger.warning(f"Port translation: {self.port} → {forward_result.external_port}")
                        self.external_port = forward_result.external_port
                else:
                    logger.warning("Auto port forwarding failed or returned no result")
                    forward_result = None
            except Exception as e:
                logger.error(f"Port forwarding failed: {e}")
                forward_result = None
            
            if not forward_result or not forward_result.success:
                console.log(f"[dim yellow]Trying STUN to find public IP...[/dim yellow]")
                
                # Try STUN as final fallback
                try:
                    stun_res = await try_stun()
                    if stun_res:
                        stun_ip, stun_port = stun_res
                        logger.success(f"STUN Success: Public IP is {stun_ip}:{stun_port}")
                        
                        display_host = stun_ip
                        
                        # Handle port translation
                        if stun_port > 0 and stun_port != self.port:
                            console.log(f"[yellow]⚠️ NAT changed port: {self.port} → {stun_port}[/yellow]")
                            console.log(f"[yellow]You may need to forward port {stun_port} on your router[/yellow]")
                            self.external_port = stun_port
                        else:
                            console.log(f"[yellow]Note: You may need to manually forward port {self.port} on your router.[/yellow]")
                    else:
                        logger.error(f"STUN failed. Using LAN IP: {display_host}")
                except Exception as e:
                    logger.error(f"STUN error: {e}")
                    
                # Still try to get public IP for manual instructions
                try:
                    public_ip = await get_public_ip()
                    if public_ip:
                        console.log(f"[yellow]Your public IP appears to be: {public_ip}[/yellow]")
                        console.log(f"[yellow]Manual port forwarding needed for public access[/yellow]")
                except Exception as e:
                    console.log(f"[dim]Could not get public IP: {e}[/dim]")
        else:
            display_host = self.host
            console.log(f"[cyan]Using host: {display_host}[/cyan]")
            
        # Use explicit announce_port if provided, otherwise use the appropriate port
        if hasattr(self, 'external_port') and self.external_port and not self.announce_port:
            display_port = self.external_port
            console.log(f"[cyan]Using external port: {display_port}[/cyan]")
        else:
            display_port = self.announce_port if self.announce_port else self.port
            console.log(f"[cyan]Using port: {display_port}[/cyan]")
            
        self.addr = f"ws://{display_host}:{display_port}"
        
        # Start monitoring loop
        self._monitor_active = True
        asyncio.create_task(self._monitoring_loop(15))
        logger.debug("Monitoring loop started")
        
        logger.success(f"P2P Node Started at {self.addr}")
        logger.info(f"Peer ID: {self.peer_id}")

    async def stop(self):
        console.log(f"[yellow]Stopping P2P Node...[/yellow]")
        self._running = False
        self._monitor_active = False
        
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.debug("WebSocket server closed")
        
        # Close all peer connections
        async with self._lock:
            for pid, info in self.peers.items():
                try:
                    await info["ws"].close()
                    logger.debug(f"Closed connection to peer {pid}")
                except:
                    pass
            self.peers.clear()
            logger.success("P2P Node Stopped")

    async def connect_bootstrap(self, link_or_addr: str):
        addrs: List[str]
        if link_or_addr.startswith("p2pnet://"):
            parsed = parse_join_link(link_or_addr)
            addrs = [a for a in parsed.get("bootstrap", [])]
            logger.info(f"Parsed join link, bootstrap addresses: {addrs}")
        else:
            addrs = [link_or_addr]
            
        for addr in addrs:
            try:
                logger.info(f"Connecting to bootstrap: {addr}")
                await self._connect_peer(addr)
                logger.success(f"Connected to bootstrap: {addr}")
                return  # Success on first connection
            except Exception as e:
                logger.warning(f"Bootstrap connect failed {addr}: {e}")
        logger.error("All bootstrap connections failed")

    async def add_service(self, service: BaseService):
        self.local_services[service.name] = service
        logger.success(f"Added service: {service.name}")
        # Broadcast announcement
        await self._broadcast({
            "type": "service_announce",
            "service": service.name,
            "meta": service.get_metadata()
        })

    async def add_hf_service(self, model_name: str, price_per_token: float, max_new_tokens: int = 32):
        svc = HFService(model_name, price_per_token, max_new_tokens)
        await self.add_service(svc)

    # --- Networking Internal ---

    async def _connect_peer(self, addr: str):
        if addr == self.addr:
            logger.debug("Skipping self-connection")
            return
            
        try:
            logger.info(f"Connecting to peer: {addr}")
            ws = await connect(addr, max_size=32*1024*1024)
            logger.success(f"Connected to {addr}")
        except Exception as e:
            # Smart Fallback: If wss failed due to SSL mismatch (common in local dev), try plain ws
            if addr.startswith("wss://") and ("WRONG_VERSION_NUMBER" in str(e) or "connection was forcibly closed" in str(e).lower()):
                fallback = addr.replace("wss://", "ws://")
                logger.warning(f"SSL handshake failed for {addr}. Retrying with insecure {fallback}...")
                try:
                    ws = await connect(fallback, max_size=32*1024*1024)
                    logger.success(f"Connected to {fallback} (Fallback Success)")
                except Exception as e2:
                    raise IOError(f"Could not connect to {addr} (or fallback {fallback}): {e2}")
            else:
                raise IOError(f"Could not connect to {addr}: {e}")
            
        pid = new_id("peer")  # Temporary until handshake
        
        async with self._lock:
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0}
            
        # Handshake
        await self._send(ws, self._make_hello_msg())
        asyncio.create_task(self._peer_reader(ws))

    async def _handle_connection(self, ws: ServerConnection):
        logger.info(f"New connection from {ws.remote_address}")
        await self._peer_reader(ws)

    async def _peer_reader(self, ws: ClientConnection | ServerConnection):
        rem = ws.remote_address
        logger.debug(f"Reader started for {rem}")
        try:
            async for raw in ws:
                logger.debug(f"Received {len(raw)} bytes from {rem}")
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type")
                    logger.debug(f"Msg type: {msg_type} from {rem}")
                    await self._on_message(ws, data)
                except json.JSONDecodeError as e:
                    logger.error(f"Valid JSON expected from {rem}: {e}")
                    continue
                except Exception as e:
                    logger.error(f"Error handling message from {rem}: {e}")
                    import traceback
                    traceback.print_exc()
        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"Connection closed {rem}: {e.code} {e.reason}")
        except Exception as e:
            logger.error(f"Connection error {rem}: {e}")
        finally:
            await self._on_disconnect(ws)

    async def _on_disconnect(self, ws):
        async with self._lock:
            for pid, info in list(self.peers.items()):
                if info.get("ws") is ws:
                    self.peers.pop(pid, None)
                    self.providers.pop(pid, None)
                    logger.info(f"Peer disconnected: {pid}")
                    break

    async def _send(self, ws, obj: Dict[str, Any]):
        try:
            msg = json.dumps(obj)
            await ws.send(msg)
            logger.debug(f"Sent message type: {obj.get('type')}")
        except Exception as e:
            logger.warning(f"Send failed: {e}")

    async def _broadcast(self, obj: Dict[str, Any]):
        async with self._lock:
            peers = list(self.peers.values())
        
        if not peers:
            logger.debug("No peers to broadcast to")
            return
            
        logger.debug(f"Broadcasting to {len(peers)} peers")
        tasks = [self._send(p["ws"], obj) for p in peers]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    # --- Protocol Handling ---

    def _make_hello_msg(self) -> Dict[str, Any]:
        from .utils import get_system_metrics
        services_meta = {
            name: svc.get_metadata() 
            for name, svc in self.local_services.items()
        }
        return {
            "type": "hello",
            "peer_id": self.peer_id,
            "addr": self.addr,
            "region": self.region,
            "metrics": get_system_metrics(),
            "services": services_meta
        }

    async def _on_message(self, ws, data: Dict[str, Any]):
        msg_type = data.get("type")
        logger.debug(f"Handling message type: {msg_type}")
        
        handlers = {
            "hello": self._handle_hello,
            "peer_list": self._handle_peer_list,
            "ping": self._handle_ping,
            "pong": self._handle_pong,
            "service_announce": self._handle_service_announce,
            "gen_request": self._handle_gen_request,
            "gen_result": self._handle_gen_result,
            "piece_request": self._handle_piece_request,
            "piece_data": self._handle_piece_data,
        }
        
        handler = handlers.get(msg_type)
        if handler:
            await handler(ws, data)
        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _handle_hello(self, ws, data):
        pid = data.get("peer_id")
        addr = data.get("addr")
        logger.info(f"HELLO from peer {pid} at {addr}")
        
        async with self._lock:
            # Reclassify peer with correct ID
            old_pid = None
            for p, info in self.peers.items():
                if info["ws"] is ws:
                    old_pid = p
                    break
            
            if old_pid and old_pid != pid:
                logger.debug(f"Reclassifying peer {old_pid} -> {pid}")
                self.peers.pop(old_pid)
                
            # Preserve existing metrics if present
            existing_metrics = self.peers.get(pid, {}).get("metrics")
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0, "metrics": existing_metrics}
            
            # Update providers
            svcs = data.get("services", {})
            if svcs:
                self.providers[pid] = svcs
                logger.info(f"Peer {pid} services: {list(svcs.keys())}")

        # Reply with our hello and peer list
        await self._send(ws, self._make_hello_msg())
        
        peer_list = [v["addr"] for v in self.peers.values() if v.get("addr")]
        await self._send(ws, {"type": "peer_list", "peers": peer_list})
        
        # Start keeping alive
        await self._send(ws, {"type": "ping", "ts": time.time()})

    async def _handle_peer_list(self, ws, data):
        peers = data.get("peers", [])
        logger.info(f"Received peer list with {len(peers)} addresses")
        for addr in peers:
            if addr == self.addr:
                continue
            # Simple check to avoid duplicates (O(N) but N is small)
            if not any(v.get("addr") == addr for v in self.peers.values()):
                logger.debug(f"Connecting to new peer from list: {addr}")
                asyncio.create_task(self._connect_peer(addr))

    async def _handle_ping(self, ws, data):
        # Store received metrics if present
        metrics = data.get("metrics")
        if metrics:
            logger.debug("Received metrics from peer")
        
        async with self._lock:
            found_peer = False
            for p, info in self.peers.items():
                if info["ws"] is ws:
                    self.peers[p]["metrics"] = metrics
                    logger.debug(f"Updated metrics for {p}")
                    found_peer = True
                    break
            if not found_peer:
                logger.warning("Could not find peer for WS")
        
        await self._send(ws, {"type": "pong", "ts": data.get("ts")})

    async def _handle_pong(self, ws, data):
        ts = data.get("ts")
        if ts is None:
            ts = time.time()
        rtt = (time.time() - float(ts)) * 1000.0
        async with self._lock:
            for pid, info in self.peers.items():
                if info["ws"] is ws:
                    info["last_pong_ms"] = rtt
                    # record latency for provider selection
                    if pid in self.providers:
                        self.providers[pid]["_latency"] = rtt
                    logger.debug(f"Peer {pid} RTT: {rtt:.1f}ms")
                    break

    async def _handle_service_announce(self, ws, data):
        svc = data.get("service")
        meta = data.get("meta", {})
        logger.info(f"Service announce: {svc} from peer")
        
        async with self._lock:
            for pid, info in self.peers.items():
                if info["ws"] is ws:
                    if pid not in self.providers:
                        self.providers[pid] = {}
                    self.providers[pid][svc] = meta
                    logger.success(f"Registered service {svc} from peer {pid}")
                    break

    async def _handle_gen_request(self, ws, data):
        rid = data.get("rid")
        svc_name = data.get("svc", "hf")
        logger.info(f"Generation request {rid} for service {svc_name}")
        
        # Determine service
        svc = self.local_services.get(svc_name)
        
        if not svc:
            logger.error(f"Service {svc_name} not found locally")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": "no_service"})
            return
            
        try:
            logger.debug(f"Executing service {svc_name}")
            result = svc.execute(data)
            response = {"type": "gen_result", "rid": rid, **result}
            await self._send(ws, response)
            logger.success(f"Sent generation result for {rid}")
        except ServiceError as e:
            logger.error(f"Service error for {rid}: {e}")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": str(e)})
        except Exception as e:
            logger.error(f"Unexpected error for {rid}: {e}")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": f"internal_error: {str(e)}"})

    async def _handle_gen_result(self, ws, data):
        rid = data.get("rid")
        logger.debug(f"Received gen_result for request {rid}")
        if rid in self._pending_requests:
            future = self._pending_requests.pop(rid)
            if not future.done():
                if "error" in data:
                    logger.error(f"Request {rid} failed: {data['error']}")
                    future.set_exception(RuntimeError(data["error"]))
                else:
                    logger.success(f"Request {rid} succeeded")
                    future.set_result(data)
        else:
            logger.warning(f"Unknown request ID: {rid}")

    async def _handle_piece_request(self, ws, data):
        # ... logic as before ...
        logger.debug("Piece request received")
        pass

    async def _handle_piece_data(self, ws, data):
        # ... logic as before ...
        logger.debug("Piece data received")
        pass

    # --- Public API ---

    def list_providers(self) -> List[Dict[str, Any]]:
        out = []
        logger.debug(f"Listing providers, current count: {len(self.providers)}")
        for pid, svcs in self.providers.items():
            all_models = []
            min_price = float('inf')
            found_ai_service = False
            service_tag = None
            
            for svc_name, meta in svcs.items():
                if svc_name.startswith("_"): 
                    continue
                # Aggregate models from any service that has them (hf, ollama)
                if isinstance(meta, dict) and "models" in meta:
                    found_ai_service = True
                    all_models.extend(meta.get("models", []))
                    price = meta.get("price_per_token", 0.0)
                    if price < min_price:
                        min_price = price
                    # Pick up the tag if it's there (remote, etc.)
                    if "tag" in meta and not service_tag:
                         service_tag = meta["tag"]
            
            if found_ai_service:
                out.append({
                    "peer_id": pid,
                    "addr": self.peers.get(pid, {}).get("addr"),
                    "latency_ms": svcs.get("_latency"),
                    "models": list(set(all_models)),
                    "price_per_token": min_price if min_price != float('inf') else 0.0,
                    "tag": service_tag
                })
        
        logger.debug(f"Found {len(out)} providers")
        return out

    def pick_provider(self, model_name: str) -> Optional[Tuple[str, Dict[str, Any]]]:
        candidates = []
        logger.debug(f"Picking provider for model: {model_name}")
        
        for pid, svcs in self.providers.items():
            # Check all services
            for svc_name, meta in svcs.items():
                if svc_name.startswith("_"): 
                    continue
                
                if isinstance(meta, dict) and model_name in meta.get("models", []):
                    price = meta.get("price_per_token", 0.0)
                    latency = svcs.get("_latency", 99999.0)
                    candidates.append((pid, price, latency, svc_name))
                    logger.debug(f"Found candidate: {pid}, price: {price}, latency: {latency}")
                    break  # Found a service on this peer
        
        if not candidates:
            logger.warning(f"No providers found for model {model_name}")
            return None
            
        # Sort by price, then latency
        candidates.sort(key=lambda x: (x[1], x[2]))
        best_id, best_price, best_latency, best_svc = candidates[0]
        logger.success(f"Selected provider: {best_id}, service: {best_svc}, price: {best_price}, latency: {best_latency}")
        
        # Return meta plus the service name so caller can use it
        best_svcs = self.providers[best_id]
        for svc_name, meta in best_svcs.items():
            if svc_name == best_svc:
                m = meta.copy()
                m["_svc_name"] = svc_name
                return best_id, m
                
        return None  # Should not happen

    async def request_generation(self, provider_id: str, prompt: str, max_new_tokens: int = 32, model_name: Optional[str] = None):
        info = self.peers.get(provider_id)
        if not info:
            logger.error(f"Provider {provider_id} not connected")
            raise RuntimeError("provider_not_connected")
            
        rid = new_id("req")
        future = asyncio.Future()
        self._pending_requests[rid] = future
        
        # Resolve Service Name
        target_svc = "hf"  # Default
        if provider_id in self.providers:
            svcs = self.providers[provider_id]
            # If model is specified, search for it
            if model_name:
                for s, meta in svcs.items():
                    if not s.startswith("_") and model_name in meta.get("models", []):
                        target_svc = s
                        logger.debug(f"Using service {target_svc} for model {model_name}")
                        break
            
            # If not found or not specified, pick first available (heuristic)
            if target_svc == "hf":  # Still default
                for s in svcs.keys():
                    if not s.startswith("_"):
                        target_svc = s
                        logger.debug(f"Fallback to service {target_svc}")
                        break

        req = {
            "type": "gen_request",
            "rid": rid,
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
            "model": model_name,
            "svc": target_svc
        }
        
        logger.info(f"Sending generation request {rid} to {provider_id}")
        await self._send(info["ws"], req)
        
        try:
            result = await asyncio.wait_for(future, timeout=60.0)
            logger.success(f"Generation request {rid} completed")
            return result
        except asyncio.TimeoutError:
            self._pending_requests.pop(rid, None)
            logger.error(f"Generation request {rid} timed out")
            raise RuntimeError("request_timed_out")
        except Exception as e:
            logger.error(f"Generation request {rid} failed: {e}")
            raise


async def run_p2p_node(
    host: str = None, 
    port: int = None, 
    bootstrap_link: str = None, 
    model_name: str = None, 
    price_per_token: float = 0.0, 
    announce_host: str = None, 
    backend: str = "hf",
    api_port: int = None,
    entrypoint_url: str = None,
    region: str = "Auto"
):
    """Entry point for running a peer node with one or more models."""
    from .p2p import generate_join_link
    
    console.print(f"\n[bold cyan]🚀 Starting P2P Node[/bold cyan]")
    console.print(f"[dim]Host: {host or '0.0.0.0'}, Port: {port or 0}, Region: {region}[/dim]")
    
    node = P2PNode(host=host or "0.0.0.0", port=port or 0, announce_host=announce_host, entrypoint_url=entrypoint_url, region=region)
    await node.start()
    
    # Start API if requested
    if api_port:
        import uvicorn
        from .api import app as api_app
        # Seed the global node in api.py
        import bee2bee.api
        bee2bee.api.node = node
        config = uvicorn.Config(api_app, host=node.host, port=api_port, log_level="warning")
        server = uvicorn.Server(config)
        asyncio.create_task(server.serve())
        console.print(f"[bold green]🚀 API Gateway started on http://{node.host}:{api_port}[/bold green]")
    
    # Port/Addr is now auto-resolved by start()
    
    if bootstrap_link:
        console.print(f"\n[yellow]🔗 Connecting to bootstrap...[/yellow] {bootstrap_link}")
        await node.connect_bootstrap(bootstrap_link)
    
    if model_name:
        console.print(f"\n[yellow]🤖 Preparing model '{model_name}' ({backend})...[/yellow]")
        
        svc = None
        if backend == "hf":
            svc = HFService(model_name, float(price_per_token or 0.0))
        elif backend == "hf_remote":
            from .services import HFRemoteService
            # Get token from env or parameters if we extend it later
            svc = HFRemoteService(model_name, price_per_token=float(price_per_token or 0.005))
        elif backend == "ollama":
            from .services import OllamaService
            svc = OllamaService(model_name)
        else:
            console.print(f"[red]Unknown backend: {backend}[/red]")
            return

        # Run loading in thread so we don't block pings
        if svc:
            console.print(f"[dim]Loading model...[/dim]")
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(None, svc.load_sync)
                console.print(f"[green]✅ Model loaded successfully[/green]")
            except Exception as e:
                console.print(f"[red]❌ Failed to load model: {e}[/red]")
                return
            
            await node.add_service(svc)
            
            model_hash = sha256_hex_bytes(model_name.encode())
            # For ollama, we might want to hint the backend in the join link, but standard join link is model based.
            # We'll just advertise the model name.
            join_link = generate_join_link("connectit", model_name, model_hash, [node.addr])
            
            console.print(f"[cyan]Model:[/cyan] {model_name} ({backend})")
            console.print(f"[blue]Join Link:[/blue] {join_link}")

    # Initial sync
    if node.registry.enabled:
        await node.sync_with_registry()

    # Keep alive with Heartbeat
    try:
        console.print(f"\n[green]✅ Node running. Press Ctrl+C to stop.[/green]")
        while True:
            await asyncio.sleep(15)
            # Periodic Heartbeat
            peer_count = len(node.peers)
            logger.debug(f"💓 Heartbeat | Peers: {peer_count} | Services: {len(node.local_services)}")
            
    except asyncio.CancelledError:
        console.print(f"\n[yellow]👋 Stopping node...[/yellow]")
        await node.stop()
    except KeyboardInterrupt:
        console.print(f"\n[yellow]👋 Received interrupt, stopping...[/yellow]")
        await node.stop()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Bee2Bee P2P Runtime Engine")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=4001, help="Bind port")
    parser.add_argument("--register", action="store_true", help="Register as a service provider")
    parser.add_argument("--model", default="phi3", help="Model name to serve")
    parser.add_argument("--provider", default="hf", help="Inference backend (hf, ollama, hf_remote)")
    parser.add_argument("--endpoint", default=None, help="Backend endpoint URL (e.g. for Ollama)")
    parser.add_argument("--tag", default="Core-Node", help="Node tag/region")
    parser.add_argument("--bootstrap", default=None, help="Bootstrap node link")
    
    args = parser.parse_args()

    if args.endpoint and args.provider == "ollama":
        os.environ["OLLAMA_HOST"] = args.endpoint

    asyncio.run(run_p2p_node(
        host=args.host,
        port=args.port,
        model_name=args.model if args.register else None,
        backend=args.provider,
        bootstrap_link=args.bootstrap,
        announce_host=args.host
    ))

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

from .p2p import parse_join_link, sha256_hex_bytes
from .utils import new_id, is_colab
from .pieces import split_pieces, piece_hashes
from .services import BaseService, HFService, ServiceError
from .nat import try_upnp_map
from .nat import auto_port_forward, try_stun, get_public_ip

# In Colab/Jupyter, rich auto-detects HTML output which often buffers or fails in subprocesses.
# We force terminal mode to ensure we get raw text streaming.
console_kwargs = {}
if is_colab():
    console_kwargs = {"force_terminal": True, "force_interactive": False}

console = Console(**console_kwargs)


class P2PNode:
    def __init__(self, host: str = "0.0.0.0", port: int = 4001, announce_host: Optional[str] = None, announce_port: Optional[int] = None):
        self.host = host
        self.port = port
        self.announce_host = announce_host
        self.announce_port = announce_port
        self.peer_id = new_id("peer")
        
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

    async def enable_monitoring(self, interval_seconds: int = 3600):
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
            except Exception as e:
                console.print(f"[red]Monitoring Error: {e}[/red]")
            await asyncio.sleep(interval)

    async def _run_health_checks(self):
        from .utils import now_ms, get_system_metrics
        timestamp = now_ms()
        peers_to_check = list(self.peers.items())
        
        # Collect local metrics once to send to everyone
        local_metrics = get_system_metrics()
        
        # Only log if we have peers to avoid spam
        if len(peers_to_check) > 0:
            console.log(f"[dim]Running Health Check on {len(peers_to_check)} peers...[/dim]")
        
        for pid, peer_data in peers_to_check:
            ws = peer_data.get("ws")
            # Handle different websockets versions (some don't have .closed)
            is_closed = getattr(ws, "closed", False) or not getattr(ws, "open", True)
            if not ws or is_closed:
                console.log(f"[yellow]Peer {pid} connection appears closed[/yellow]")
                continue
                
            # 1. Latency Check (Ping)
            t0 = time.time()
            try:
                console.log(f"[debug] Sending ping to {pid} with metrics")
                # Send ping with metrics
                await self._send(ws, {
                    "type": "ping", 
                    "timestamp": t0,
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
        console.log(f"[cyan]Starting P2P Node on {self.host}:{self.port}[/cyan]")
        
        async def handler(ws: WebSocketServerProtocol):
            await self._handle_connection(ws)

        try:
            self.server = await websockets.serve(handler, self.host, self.port, max_size=32 * 1024 * 1024)
            self._running = True
            console.log(f"[green]WebSocket server started successfully[/green]")
        except Exception as e:
            console.log(f"[red]Failed to start WebSocket server: {e}[/red]")
            raise

        # Resolve actual port if 0
        if self.port == 0:
            self.port = self.server.sockets[0].getsockname()[1]
            console.log(f"[cyan]OS assigned port: {self.port}[/cyan]")

        # Resolve announce address
        # If announce_host is set, use it.
        # Else if host is 0.0.0.0, try to detect LAN IP.
        # Else use host.
        if self.announce_host:
            display_host = self.announce_host
            console.log(f"[cyan]Using announce_host: {display_host}[/cyan]")
        elif self.host == "0.0.0.0":
            from .utils import get_lan_ip
            display_host = get_lan_ip()
            console.log(f"[cyan]Detected LAN IP: {display_host}[/cyan]")

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
                        console.log(f"[yellow]⚠️ Port translation: {self.port} → {forward_result.external_port}[/yellow]")
                        self.external_port = forward_result.external_port
                else:
                    console.log(f"[yellow]⚠️ Auto port forwarding failed or returned no result[/yellow]")
                    forward_result = None
            except Exception as e:
                console.log(f"[yellow]⚠️ Port forwarding failed: {e}[/yellow]")
                forward_result = None
            
            if not forward_result or not forward_result.success:
                console.log(f"[dim yellow]Trying STUN to find public IP...[/dim yellow]")
                
                # Try STUN as final fallback
                try:
                    stun_res = await try_stun()
                    if stun_res:
                        stun_ip, stun_port = stun_res
                        console.log(f"[green]✅ STUN Success:[/green] Public IP is {stun_ip}:{stun_port}")
                        
                        display_host = stun_ip
                        
                        # Handle port translation
                        if stun_port > 0 and stun_port != self.port:
                            console.log(f"[yellow]⚠️ NAT changed port: {self.port} → {stun_port}[/yellow]")
                            console.log(f"[yellow]You may need to forward port {stun_port} on your router[/yellow]")
                            self.external_port = stun_port
                        else:
                            console.log(f"[yellow]Note: You may need to manually forward port {self.port} on your router.[/yellow]")
                    else:
                        console.log(f"[red]❌ STUN failed. Using LAN IP: {display_host}[/red]")
                except Exception as e:
                    console.log(f"[red]STUN error: {e}[/red]")
                    
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
        console.log(f"[dim]Monitoring loop started[/dim]")
        
        console.log(f"[bold green]✅ P2P Node Started[/bold green] at {self.addr}")
        console.log(f"[dim]Peer ID: {self.peer_id}[/dim]")

    async def stop(self):
        console.log(f"[yellow]Stopping P2P Node...[/yellow]")
        self._running = False
        self._monitor_active = False
        
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            console.log(f"[dim]WebSocket server closed[/dim]")
        
        # Close all peer connections
        async with self._lock:
            for pid, info in self.peers.items():
                try:
                    await info["ws"].close()
                    console.log(f"[dim]Closed connection to peer {pid}[/dim]")
                except:
                    pass
            self.peers.clear()
            console.log(f"[green]✅ P2P Node Stopped[/green]")

    async def connect_bootstrap(self, link_or_addr: str):
        addrs: List[str]
        if link_or_addr.startswith("p2pnet://"):
            parsed = parse_join_link(link_or_addr)
            addrs = [a for a in parsed.get("bootstrap", [])]
            console.log(f"[cyan]Parsed join link, bootstrap addresses: {addrs}[/cyan]")
        else:
            addrs = [link_or_addr]
            
        for addr in addrs:
            try:
                console.log(f"[cyan]Connecting to bootstrap: {addr}[/cyan]")
                await self._connect_peer(addr)
                console.log(f"[green]✅ Connected to bootstrap: {addr}[/green]")
                return  # Success on first connection
            except Exception as e:
                console.log(f"[yellow]Bootstrap connect failed {addr}: {e}[/yellow]")
        console.log(f"[red]❌ All bootstrap connections failed[/red]")

    async def add_service(self, service: BaseService):
        self.local_services[service.name] = service
        console.log(f"[green]✅ Added service: {service.name}[/green]")
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
            console.log(f"[yellow]Skipping self-connection[/yellow]")
            return
            
        try:
            console.log(f"[cyan]Connecting to peer: {addr}[/cyan]")
            ws = await connect(addr, max_size=32*1024*1024)
            console.log(f"[green]✅ Connected to {addr}[/green]")
        except Exception as e:
            raise IOError(f"Could not connect to {addr}: {e}")
            
        pid = new_id("peer")  # Temporary until handshake
        
        async with self._lock:
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0}
            
        # Handshake
        await self._send(ws, self._make_hello_msg())
        asyncio.create_task(self._peer_reader(ws))

    async def _handle_connection(self, ws: ServerConnection):
        console.log(f"[cyan]New connection from {ws.remote_address}[/cyan]")
        await self._peer_reader(ws)

    async def _peer_reader(self, ws: ClientConnection | ServerConnection):
        rem = ws.remote_address
        console.log(f"[dim]Reader started for {rem}[/dim]")
        try:
            async for raw in ws:
                console.log(f"[debug] Received {len(raw)} bytes from {rem}")
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type")
                    console.log(f"[debug] Msg type: {msg_type} from {rem}")
                    await self._on_message(ws, data)
                except json.JSONDecodeError as e:
                    console.log(f"[red]Valid JSON expected from {rem}: {e}[/red]")
                    continue
                except Exception as e:
                    console.log(f"[red]Error handling message from {rem}: {e}[/red]")
                    import traceback
                    traceback.print_exc()
        except websockets.exceptions.ConnectionClosed as e:
            console.log(f"[yellow]Connection closed {rem}: {e.code} {e.reason}[/yellow]")
        except Exception as e:
            console.log(f"[red]Connection error {rem}:[/red] {e}")
        finally:
            await self._on_disconnect(ws)

    async def _on_disconnect(self, ws):
        async with self._lock:
            for pid, info in list(self.peers.items()):
                if info.get("ws") is ws:
                    self.peers.pop(pid, None)
                    self.providers.pop(pid, None)
                    console.log(f"[yellow]Peer disconnected: {pid}[/yellow]")
                    break

    async def _send(self, ws, obj: Dict[str, Any]):
        try:
            msg = json.dumps(obj)
            await ws.send(msg)
            console.log(f"[debug] Sent message type: {obj.get('type')}")
        except Exception as e:
            console.log(f"[yellow]Send failed: {e}[/yellow]")

    async def _broadcast(self, obj: Dict[str, Any]):
        async with self._lock:
            peers = list(self.peers.values())
        
        if not peers:
            console.log(f"[dim]No peers to broadcast to[/dim]")
            return
            
        console.log(f"[debug] Broadcasting to {len(peers)} peers")
        tasks = [self._send(p["ws"], obj) for p in peers]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    # --- Protocol Handling ---

    def _make_hello_msg(self) -> Dict[str, Any]:
        services_meta = {
            name: svc.get_metadata() 
            for name, svc in self.local_services.items()
        }
        return {
            "type": "hello",
            "peer_id": self.peer_id,
            "addr": self.addr,
            "services": services_meta
        }

    async def _on_message(self, ws, data: Dict[str, Any]):
        msg_type = data.get("type")
        console.log(f"[debug] Handling message type: {msg_type}")
        
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
            console.log(f"[yellow]Unknown message type: {msg_type}[/yellow]")

    async def _handle_hello(self, ws, data):
        pid = data.get("peer_id")
        addr = data.get("addr")
        console.log(f"[cyan]HELLO from peer {pid} at {addr}[/cyan]")
        
        async with self._lock:
            # Reclassify peer with correct ID
            old_pid = None
            for p, info in self.peers.items():
                if info["ws"] is ws:
                    old_pid = p
                    break
            
            if old_pid and old_pid != pid:
                console.log(f"[dim]Reclassifying peer {old_pid} -> {pid}[/dim]")
                self.peers.pop(old_pid)
                
            # Preserve existing metrics if present
            existing_metrics = self.peers.get(pid, {}).get("metrics")
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0, "metrics": existing_metrics}
            
            # Update providers
            svcs = data.get("services", {})
            if svcs:
                self.providers[pid] = svcs
                console.log(f"[cyan]Peer {pid} services: {list(svcs.keys())}[/cyan]")

        # Reply with our hello and peer list
        await self._send(ws, self._make_hello_msg())
        
        peer_list = [v["addr"] for v in self.peers.values() if v.get("addr")]
        await self._send(ws, {"type": "peer_list", "peers": peer_list})
        
        # Start keeping alive
        await self._send(ws, {"type": "ping", "ts": time.time()})

    async def _handle_peer_list(self, ws, data):
        peers = data.get("peers", [])
        console.log(f"[cyan]Received peer list with {len(peers)} addresses[/cyan]")
        for addr in peers:
            if addr == self.addr:
                continue
            # Simple check to avoid duplicates (O(N) but N is small)
            if not any(v.get("addr") == addr for v in self.peers.values()):
                console.log(f"[dim]Connecting to new peer from list: {addr}[/dim]")
                asyncio.create_task(self._connect_peer(addr))

    async def _handle_ping(self, ws, data):
        # Store received metrics if present
        metrics = data.get("metrics")
        if metrics:
            console.log(f"[debug] Received metrics from peer")
        
        async with self._lock:
            found_peer = False
            for p, info in self.peers.items():
                if info["ws"] is ws:
                    self.peers[p]["metrics"] = metrics
                    console.log(f"[debug] Updated metrics for {p}")
                    found_peer = True
                    break
            if not found_peer:
                console.log(f"[yellow]Could not find peer for WS[/yellow]")
        
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
                    console.log(f"[debug] Peer {pid} RTT: {rtt:.1f}ms")
                    break

    async def _handle_service_announce(self, ws, data):
        svc = data.get("service")
        meta = data.get("meta", {})
        console.log(f"[cyan]Service announce: {svc} from peer[/cyan]")
        
        async with self._lock:
            for pid, info in self.peers.items():
                if info["ws"] is ws:
                    if pid not in self.providers:
                        self.providers[pid] = {}
                    self.providers[pid][svc] = meta
                    console.log(f"[green]✅ Registered service {svc} from peer {pid}[/green]")
                    break

    async def _handle_gen_request(self, ws, data):
        rid = data.get("rid")
        svc_name = data.get("svc", "hf")
        console.log(f"[cyan]Generation request {rid} for service {svc_name}[/cyan]")
        
        # Determine service
        svc = self.local_services.get(svc_name)
        
        if not svc:
            console.log(f"[red]Service {svc_name} not found locally[/red]")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": "no_service"})
            return
            
        try:
            console.log(f"[debug] Executing service {svc_name}")
            result = svc.execute(data)
            response = {"type": "gen_result", "rid": rid, **result}
            await self._send(ws, response)
            console.log(f"[green]✅ Sent generation result for {rid}[/green]")
        except ServiceError as e:
            console.log(f"[red]Service error for {rid}: {e}[/red]")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": str(e)})
        except Exception as e:
            console.log(f"[red]Unexpected error for {rid}: {e}[/red]")
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": f"internal_error: {str(e)}"})

    async def _handle_gen_result(self, ws, data):
        rid = data.get("rid")
        console.log(f"[debug] Received gen_result for request {rid}")
        if rid in self._pending_requests:
            future = self._pending_requests.pop(rid)
            if not future.done():
                if "error" in data:
                    console.log(f"[red]Request {rid} failed: {data['error']}[/red]")
                    future.set_exception(RuntimeError(data["error"]))
                else:
                    console.log(f"[green]✅ Request {rid} succeeded[/green]")
                    future.set_result(data)
        else:
            console.log(f"[yellow]Unknown request ID: {rid}[/yellow]")

    async def _handle_piece_request(self, ws, data):
        # ... logic as before ...
        console.log(f"[debug] Piece request received")
        pass

    async def _handle_piece_data(self, ws, data):
        # ... logic as before ...
        console.log(f"[debug] Piece data received")
        pass

    # --- Public API ---

    def list_providers(self) -> List[Dict[str, Any]]:
        out = []
        console.log(f"[debug] Listing providers, current count: {len(self.providers)}")
        for pid, svcs in self.providers.items():
            all_models = []
            min_price = float('inf')
            found_ai_service = False
            
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
            
            if found_ai_service:
                out.append({
                    "peer_id": pid,
                    "addr": self.peers.get(pid, {}).get("addr"),
                    "latency_ms": svcs.get("_latency"),
                    "models": list(set(all_models)),
                    "price_per_token": min_price if min_price != float('inf') else 0.0,
                })
        
        console.log(f"[debug] Found {len(out)} providers")
        return out

    def pick_provider(self, model_name: str) -> Optional[Tuple[str, Dict[str, Any]]]:
        candidates = []
        console.log(f"[debug] Picking provider for model: {model_name}")
        
        for pid, svcs in self.providers.items():
            # Check all services
            for svc_name, meta in svcs.items():
                if svc_name.startswith("_"): 
                    continue
                
                if isinstance(meta, dict) and model_name in meta.get("models", []):
                    price = meta.get("price_per_token", 0.0)
                    latency = svcs.get("_latency", 99999.0)
                    candidates.append((pid, price, latency, svc_name))
                    console.log(f"[debug] Found candidate: {pid}, price: {price}, latency: {latency}")
                    break  # Found a service on this peer
        
        if not candidates:
            console.log(f"[yellow]No providers found for model {model_name}[/yellow]")
            return None
            
        # Sort by price, then latency
        candidates.sort(key=lambda x: (x[1], x[2]))
        best_id, best_price, best_latency, best_svc = candidates[0]
        console.log(f"[green]✅ Selected provider: {best_id}, service: {best_svc}, price: {best_price}, latency: {best_latency}[/green]")
        
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
            console.log(f"[red]Provider {provider_id} not connected[/red]")
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
                        console.log(f"[debug] Using service {target_svc} for model {model_name}")
                        break
            
            # If not found or not specified, pick first available (heuristic)
            if target_svc == "hf":  # Still default
                for s in svcs.keys():
                    if not s.startswith("_"):
                        target_svc = s
                        console.log(f"[debug] Fallback to service {target_svc}")
                        break

        req = {
            "type": "gen_request",
            "rid": rid,
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
            "model": model_name,
            "svc": target_svc
        }
        
        console.log(f"[cyan]Sending generation request {rid} to {provider_id}[/cyan]")
        await self._send(info["ws"], req)
        
        try:
            result = await asyncio.wait_for(future, timeout=60.0)
            console.log(f"[green]✅ Generation request {rid} completed[/green]")
            return result
        except asyncio.TimeoutError:
            self._pending_requests.pop(rid, None)
            console.log(f"[red]❌ Generation request {rid} timed out[/red]")
            raise RuntimeError("request_timed_out")
        except Exception as e:
            console.log(f"[red]❌ Generation request {rid} failed: {e}[/red]")
            raise


async def run_p2p_node(host: Optional[str] = None, port: Optional[int] = None, bootstrap_link: Optional[str] = None, 
                       model_name: Optional[str] = None, price_per_token: Optional[float] = None, 
                       announce_host: Optional[str] = None, backend: str = "hf"):
    from .p2p import generate_join_link
    
    # Defaults
    if host is None:
        host = "0.0.0.0" 
        
    if port is None:
        port = 0  # Let OS assign random port
        
    console.print(f"\n[bold cyan]🚀 Starting P2P Node[/bold cyan]")
    console.print(f"[dim]Host: {host}, Port: {port}, Announce: {announce_host}[/dim]")
    
    node = P2PNode(host=host, port=port, announce_host=announce_host)
    await node.start()
    
    # Port/Addr is now auto-resolved by start()
    
    if bootstrap_link:
        console.print(f"\n[yellow]🔗 Connecting to bootstrap...[/yellow] {bootstrap_link}")
        await node.connect_bootstrap(bootstrap_link)
    
    if model_name:
        console.print(f"\n[yellow]🤖 Preparing model '{model_name}' ({backend})...[/yellow]")
        
        svc = None
        if backend == "hf":
            svc = HFService(model_name, float(price_per_token or 0.0))
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

    # Keep alive with Heartbeat
    try:
        console.print(f"\n[green]✅ Node running. Press Ctrl+C to stop.[/green]")
        while True:
            await asyncio.sleep(15)
            # Periodic Heartbeat
            peer_count = len(node.peers)
            console.log(f"[dim]💓 Heartbeat | Peers: {peer_count} | Services: {len(node.local_services)}[/dim]")
            
    except asyncio.CancelledError:
        console.print(f"\n[yellow]👋 Stopping node...[/yellow]")
        await node.stop()
    except KeyboardInterrupt:
        console.print(f"\n[yellow]👋 Received interrupt, stopping...[/yellow]")
        await node.stop()
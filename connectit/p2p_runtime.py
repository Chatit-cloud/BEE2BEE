from __future__ import annotations
import asyncio
import json
import time
import base64
from typing import Any, Dict, List, Optional, Tuple
import websockets
from websockets.server import WebSocketServerProtocol
from websockets.client import WebSocketClientProtocol
from rich.console import Console

from .p2p import parse_join_link, sha256_hex_bytes
from .utils import new_id, is_colab
from .pieces import split_pieces, piece_hashes
from .services import BaseService, HFService, ServiceError
from .nat import try_upnp_map

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
        self.server: Optional[websockets.server.Serve] = None
        
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
             # console.print(f"[dim]Running Health Check on {len(peers_to_check)} peers...[/dim]")
             pass
        
        for pid, peer_data in peers_to_check:
            ws = peer_data.get("ws")
            # Handle different websockets versions (some don't have .closed)
            is_closed = getattr(ws, "closed", False) or not getattr(ws, "open", True)
            if not ws or is_closed:
                continue
                
            # 1. Latency Check (Ping)
            t0 = time.time()
            try:
                console.log(f" Sending ping to {pid} with metrics: {local_metrics}")
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
        async def handler(ws: WebSocketServerProtocol):
            await self._handle_connection(ws)
            
        # console.log(f"[cyan]P2P listening[/cyan] on ws://{self.host}:{self.port}")
        self.server = await websockets.serve(handler, self.host, self.port, max_size=32*1024*1024)
        self._running = True
        
        # Resolve actual port if 0
        if self.port == 0:
            self.port = self.server.sockets[0].getsockname()[1]
            
        # Resolve announce address
        # If announce_host is set, use it.
        # Else if host is 0.0.0.0, try to detect LAN IP.
        # Else use host.
        if self.announce_host:
            display_host = self.announce_host
        elif self.host == "0.0.0.0":
            from .utils import get_lan_ip
            display_host = get_lan_ip()
            
            # Try UPnP only if we are on 0.0.0.0 (likely local dev / home router)
            # Run in executor to not block startup
            console.log(f"[dim]Attempting UPnP Port Mapping for port {self.port}...[/dim]")
            loop = asyncio.get_running_loop()
            upnp_ok, ext_ip = await loop.run_in_executor(None, try_upnp_map, self.port)
            
            if upnp_ok and ext_ip:
                console.log(f"[green]UPnP Success:[/green] Port {self.port} mapped on Router -> Public IP: {ext_ip}")
                # We can optionally hint that external access is possible
            else:
                console.log(f"[dim yellow]UPnP Mapping Failed (or not supported by router). Manual forwarding needed.[/dim yellow]")

        else:
            display_host = self.host
            
        # Use explicit announce_port if provided, otherwise use the bound port
        display_port = self.announce_port if self.announce_port else self.port
        self.addr = f"ws://{display_host}:{display_port}"
        # Start monitoring loop
        self._monitor_active = True
        asyncio.create_task(self._monitoring_loop(15))
        
        console.log(f"[bold green]P2P Node Started[/bold green] at {self.addr}")

    async def stop(self):
        self._running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        
        # Close all peer connections
        async with self._lock:
            for info in self.peers.values():
                await info["ws"].close()
            self.peers.clear()

    async def connect_bootstrap(self, link_or_addr: str):
        addrs: List[str]
        if link_or_addr.startswith("p2pnet://"):
            parsed = parse_join_link(link_or_addr)
            addrs = [a for a in parsed.get("bootstrap", [])]
        else:
            addrs = [link_or_addr]
            
        for addr in addrs:
            try:
                await self._connect_peer(addr)
            except Exception as e:
                console.log(f"[yellow]Bootstrap connect failed[/yellow] {addr}: {e}")

    async def add_service(self, service: BaseService):
        self.local_services[service.name] = service
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
            return
            
        try:
            ws = await websockets.connect(addr, max_size=32*1024*1024)
        except Exception as e:
            raise IOError(f"Could not connect to {addr}: {e}")
            
        pid = new_id("peer")  # Temporary until handshake
        
        async with self._lock:
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0}
            
        # Handshake
        await self._send(ws, self._make_hello_msg())
        asyncio.create_task(self._peer_reader(ws))

    async def _handle_connection(self, ws: WebSocketServerProtocol):
        console.log(f"[cyan]New connection from {ws.remote_address}[/cyan]")
        await self._peer_reader(ws)

    async def _peer_reader(self, ws: WebSocketClientProtocol | WebSocketServerProtocol):
        rem = ws.remote_address
        console.log(f"[dim]Reader started for {rem}[/dim]")
        try:
            async for raw in ws:
                # console.log(f"[dim]Received {len(raw)} bytes from {rem}[/dim]")
                try:
                    data = json.loads(raw)
                    # console.log(f"[dim]Msg {data.get('type')} from {rem}[/dim]")
                    await self._on_message(ws, data)
                except json.JSONDecodeError:
                    console.log(f"[red]Valid JSON expected from {rem}[/red]")
                    continue
                except Exception as e:
                    console.log(f"[red]Error handling message from {rem}:[/red] {e}")
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
                    console.log(f"[yellow]Peer disconnected[/yellow]: {pid}")
                    break

    async def _send(self, ws, obj: Dict[str, Any]):
        try:
            await ws.send(json.dumps(obj))
        except Exception as e:
            # console.log(f"[dim]Send failed:[/dim] {e}")
            pass

    async def _broadcast(self, obj: Dict[str, Any]):
        async with self._lock:
            peers = list(self.peers.values())
        
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

    async def _handle_hello(self, ws, data):
        pid = data.get("peer_id")
        addr = data.get("addr")
        
        async with self._lock:
            # Reclassify peer with correct ID
            old_pid = None
            for p, info in self.peers.items():
                if info["ws"] is ws:
                    old_pid = p
                    break
            
            if old_pid and old_pid != pid:
                self.peers.pop(old_pid)
                
            # Preserve existing metrics if present
            existing_metrics = self.peers.get(pid, {}).get("metrics")
            self.peers[pid] = {"ws": ws, "addr": addr, "last_pong_ms": 0, "metrics": existing_metrics}
            
            # Update providers
            svcs = data.get("services", {})
            if svcs:
                self.providers[pid] = svcs

        # Reply with our hello and peer list
        await self._send(ws, self._make_hello_msg())
        
        peer_list = [v["addr"] for v in self.peers.values() if v.get("addr")]
        await self._send(ws, {"type": "peer_list", "peers": peer_list})
        
        # Start keeping alive
        await self._send(ws, {"type": "ping", "ts": time.time()})

    async def _handle_peer_list(self, ws, data):
        peers = data.get("peers", [])
        for addr in peers:
            if addr == self.addr:
                continue
            # Simple check to avoid duplicates (O(N) but N is small)
            if not any(v.get("addr") == addr for v in self.peers.values()):
                asyncio.create_task(self._connect_peer(addr))

    async def _handle_ping(self, ws, data):
        # Store received metrics if present
        metrics = data.get("metrics")
        if metrics:
            console.log(f"Received metrics from peer: {metrics}")
        # if metrics:
            async with self._lock:
                found_peer = False
                for p, info in self.peers.items():
                    if info["ws"] is ws:
                        self.peers[p]["metrics"] = metrics
                        console.log(f" [green]Updated metrics for {p}[/green]")
                        found_peer = True
                        break
                if not found_peer:
                   console.log(f" [red]Could not find peer for WS {id(ws)} in {len(self.peers)} peers[/red]")
        
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
                    break

    async def _handle_service_announce(self, ws, data):
        svc = data.get("service")
        meta = data.get("meta", {})
        
        async with self._lock:
            for pid, info in self.peers.items():
                if info["ws"] is ws:
                    if pid not in self.providers:
                        self.providers[pid] = {}
                    self.providers[pid][svc] = meta
                    break

    async def _handle_gen_request(self, ws, data):
        rid = data.get("rid")
        
        # Determine service
        svc_name = data.get("svc", "hf") # Default to hf for compatibility
        svc = self.local_services.get(svc_name)
        
        if not svc:
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": "no_service"})
            return
            
        try:
            result = svc.execute(data)
            response = {"type": "gen_result", "rid": rid, **result}
            await self._send(ws, response)
        except ServiceError as e:
            await self._send(ws, {"type": "gen_result", "rid": rid, "error": str(e)})

    async def _handle_gen_result(self, ws, data):
        rid = data.get("rid")
        if rid in self._pending_requests:
            future = self._pending_requests.pop(rid)
            if not future.done():
                future.set_result(data)

    async def _handle_piece_request(self, ws, data):
        # ... logic as before ...
        pass  # Keeping mostly as is but cleaner if I had time, for now simple stubs or copy

    async def _handle_piece_data(self, ws, data):
        # ... logic as before ...
        pass

    # --- Public API ---

    def list_providers(self) -> List[Dict[str, Any]]:
        out = []
        # console.log(f"DEBUG: Current providers state: {self.providers}")
        for pid, svcs in self.providers.items():
            all_models = []
            min_price = float('inf')
            found_ai_service = False
            
            # console.log(f"DEBUG: Checking provider {pid} services: {svcs.keys()}")

            for svc_name, meta in svcs.items():
                if svc_name.startswith("_"): continue 
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
        return out

    def pick_provider(self, model_name: str) -> Optional[Tuple[str, Dict[str, Any]]]:
        candidates = []
        for pid, svcs in self.providers.items():
            # Check all services
            for svc_name, meta in svcs.items():
                if svc_name.startswith("_"): continue
                
                if isinstance(meta, dict) and model_name in meta.get("models", []):
                    price = meta.get("price_per_token", 0.0)
                    latency = svcs.get("_latency", 99999.0)
                    # We return the specific service metadata so the caller knows which svc to invoke?
                    # Actually request_generation sends 'svc' field now. We need to pass that back?
                    # The current pick_provider returns (pid, info). 
                    # But the caller of request_generation needs to know 'svc' name.
                    # Wait, request_generation does NOT take svc name arg yet in my updated run_p2p_node, 
                    # but _handle_gen_request expects 'svc' in packet.
                    # The API caller (ConnectIT API) currently assumes "hf" or doesn't specify.
                    
                    # We'll just return the metadata, but we should inject 'svc_name' into it or handle it.
                    # For now, let's just make sure we find it.
                    candidates.append((pid, price, latency))
                    break # Found a service on this peer
        
        if not candidates:
            return None
            
        # Sort by price, then latency
        candidates.sort(key=lambda x: (x[1], x[2]))
        best_id = candidates[0][0]
        
        # We need to return the metadata for the *best service* on that peer.
        # This is slightly inefficient but let's re-find the service meta
        best_svcs = self.providers[best_id]
        for svc_name, meta in best_svcs.items():
             if not svc_name.startswith("_") and model_name in meta.get("models", []):
                 # Return meta plus the service name so caller can use it
                 # We copy it to not mutate state
                 m = meta.copy()
                 m["_svc_name"] = svc_name 
                 return best_id, m
                 
        return None # Should not happen

    async def request_generation(self, provider_id: str, prompt: str, max_new_tokens: int = 32, model_name: Optional[str] = None):
        info = self.peers.get(provider_id)
        if not info:
            raise RuntimeError("provider_not_connected")
            
        rid = new_id("req")
        future = asyncio.Future()
        self._pending_requests[rid] = future
        
        # Resolve Service Name
        # If model_name is known, find which service has it.
        # If not, pick the first service that isn't internal.
        target_svc = "hf" # Default
        if provider_id in self.providers:
            svcs = self.providers[provider_id]
            # If model is specified, search for it
            done = False
            if model_name:
                for s, meta in svcs.items():
                    if not s.startswith("_") and model_name in meta.get("models", []):
                        target_svc = s
                        done = True
                        break
            
            # If not found or not specified, pick first available (heuristic)
            if not done:
                 for s in svcs.keys():
                     if not s.startswith("_"):
                         target_svc = s
                         break

        req = {
            "type": "gen_request",
            "rid": rid,
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
            "model": model_name,
            "svc": target_svc 
        }
        
        await self._send(info["ws"], req)
        
        try:
            return await asyncio.wait_for(future, timeout=60.0)
        except asyncio.TimeoutError:
            self._pending_requests.pop(rid, None)
            raise RuntimeError("request_timed_out")


async def run_p2p_node(host: Optional[str] = None, port: Optional[int] = None, bootstrap_link: Optional[str] = None, 
                       model_name: Optional[str] = None, price_per_token: Optional[float] = None, 
                       announce_host: Optional[str] = None, backend: str = "hf"):
    from .p2p import generate_join_link
    
    # Defaults
    if host is None:
        host = "0.0.0.0" 
        
    if port is None:
        port = 0  # Let OS assign random port
        
    node = P2PNode(host=host, port=port, announce_host=announce_host)
    await node.start()
    
    # Port/Addr is now auto-resolved by start()
    
    # 1. Start Service Loading (in background/executor to not block loop)
    # We load first, BUT we do it smart. 
    # Actually, to prevent timeout disconnects, we should maintain the connection ALIVE while loading.
    # So we connect first, and the event loop continues running while we load in a thread.
    
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
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, svc.load_sync)
            
            await node.add_service(svc)
            
            model_hash = sha256_hex_bytes(model_name.encode())
            # For ollama, we might want to hint the backend in the join link, but standard join link is model based.
            # We'll just advertise the model name.
            join_link = generate_join_link("connectit", model_name, model_hash, [node.addr])
            
            console.print(f"[cyan]Model:[/cyan] {model_name} ({backend})")
            console.print(f"[blue]Join Link:[/blue] {join_link}")

    # Keep alive with Heartbeat
    try:
        while True:
            await asyncio.sleep(15)
            # Periodic Heartbeat
            peer_count = len(node.peers)
            console.log(f"[dim]💓 Heartbeat | Peers: {peer_count} | Services: {len(node.local_services)}[/dim]")
            
    except asyncio.CancelledError:
        await node.stop()

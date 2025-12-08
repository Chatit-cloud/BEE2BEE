
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import asyncio
from contextlib import asynccontextmanager

from .p2p_runtime import P2PNode

# Global node instance
node: Optional[P2PNode] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global node
    # Initialize node on startup with random port or configured port
    import os
    port = int(os.getenv("CONNECTIT_PORT", "4001"))
    host = os.getenv("CONNECTIT_HOST", "0.0.0.0")
    
    announce_host = os.getenv("CONNECTIT_ANNOUNCE_HOST")
    announce_port_str = os.getenv("CONNECTIT_ANNOUNCE_PORT")
    announce_port = int(announce_port_str) if announce_port_str else None

    node = P2PNode(host=host, port=port, announce_host=announce_host, announce_port=announce_port)
    await node.start()
    
    # Auto-bootstrap if env var is set
    bootstrap = os.getenv("CONNECTIT_BOOTSTRAP")
    if bootstrap:
        await node.connect_bootstrap(bootstrap)

    # Enable Supervisor Monitoring
    # Use shorter interval (15s) for better stability over tunnels/NAT
    await node.enable_monitoring(interval_seconds=15)
    
    # --- PRINT INSTRUCTIONS FOR USER ---
    from rich.console import Console
    from .utils import get_lan_ip, get_public_ip, is_colab
    console = Console()
    
    # Determine accessible address
    real_ip = get_lan_ip()
    public_ip = get_public_ip()
    
    # If the node is bound to 0.0.0.0, we use the LAN IP. 
    if node.host == "0.0.0.0":
        display_host = real_ip
    else:
        display_host = node.host
        
    bootstrap_addr = f"ws://{display_host}:{node.port}"
    public_bootstrap_addr = f"ws://{public_ip}:{node.port}" if public_ip else None
    
    console.print("\n[bold yellow]✨ Main Point Started Successfully![/bold yellow]")
    console.print("[dim]To connect other nodes to this network, run this command on them:[/dim]")
    
    # 1. LAN / Local
    console.print(f"\n   [bold cyan]python -m connectit config bootstrap_url {bootstrap_addr}[/bold cyan] [dim](LAN/Local)[/dim]")

    # 2. Public IP
    if public_bootstrap_addr and public_ip != real_ip:
         console.print(f"   [bold green]python -m connectit config bootstrap_url {public_bootstrap_addr}[/bold green] [dim](Public Internet)[/dim]")
         console.print("   [dim italic]Note: Ensure port[/dim italic] [bold]{}[/bold] [dim italic]is forwarded/open on your router/firewall.[/dim italic]".format(node.port))

    # 3. Colab / Tunneling
    if is_colab():
        console.print("\n[bold red]⚠️  Running in Google Colab?[/bold red]")
        console.print("   Direct connections won't work. You MUST use a tunnel (e.g., ngrok).")
        console.print("   [bold]Option 1 (ngrok):[/bold] Install ngrok, then run:")
        console.print(f"      [cyan]ngrok http {node.port}[/cyan]")
        console.print("      Then use `ws://<ngrok-url>` as your bootstrap_url.")

    # -----------------------------------
        
    yield
    
    # Cleanup
    if node:
        await node.stop()

app = FastAPI(title="ConnectIT Node API", lifespan=lifespan)

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PeerInfo(BaseModel):
    peer_id: str
    addr: str
    latency_ms: Optional[float]

class ProviderInfo(BaseModel):
    peer_id: str
    addr: Optional[str]
    latency_ms: Optional[float]
    models: List[str]
    price_per_token: Optional[float]

@app.get("/")
def home():
    return {"status": "ok", "node_id": node.peer_id if node else "not_started"}

@app.get("/peers")
def get_peers():
    if not node:
        return []
    res = []
    # print(f"API Peers state: {node.peers}") 
    for pid, info in node.peers.items():
        print(f"Peer {pid} metrics: {info.get('metrics')}")
        res.append({
            "peer_id": pid,
            "addr": info.get("addr", ""),
            "latency_ms": info.get("last_pong_ms"),
            "health_status": info.get("health_status", "unknown"),
            "last_audit": info.get("last_audit", 0),
            "metrics": info.get("metrics")
        })
    return res

@app.get("/providers", response_model=List[ProviderInfo])
def list_providers():
    if not node:
        return []
    return node.list_providers()

@app.get("/connect")
async def connect_peer(addr: str):
    if not node:
        return {"error": "Node not running"}
    try:
        if addr.startswith("p2pnet"):
            await node.connect_bootstrap(addr)
        else:
            await node._connect_peer(addr)
        return {"status": "connected", "addr": addr}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class ChatRequest(BaseModel):
    provider_id: str
    prompt: str
    model: Optional[str] = None
    max_new_tokens: Optional[int] = 64

@app.post("/chat")
async def chat(req: ChatRequest):
    if not node:
        return {"error": "Node not running"}
    try:
        # returns {"text": "...", "tokens": ...}
        res = await node.request_generation(req.provider_id, req.prompt, req.max_new_tokens, req.model)
        return {"status": "ok", "result": res}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, status, Header
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import os
from contextlib import asynccontextmanager

from loguru import logger
from .p2p_runtime import P2PNode

# Global node instance
node: Optional[P2PNode] = None

# API Key Security
API_KEY_NAME = "X-API-KEY"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def get_api_key(header_key: Optional[str] = Depends(api_key_header)):
    config_key = os.getenv("BEE2BEE_API_KEY")
    if not config_key:
        # If no key is configured, API is open (useful for development)
        return None
    if header_key == config_key:
        return header_key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API Key",
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    global node
    # Initialize node on startup with random port or configured port
    port = int(os.getenv("BEE2BEE_PORT", "4001"))
    host = os.getenv("BEE2BEE_HOST", "0.0.0.0")
    
    announce_host = os.getenv("BEE2BEE_ANNOUNCE_HOST")
    announce_port_str = os.getenv("BEE2BEE_ANNOUNCE_PORT")
    announce_port = int(announce_port_str) if announce_port_str else None

    node = P2PNode(host=host, port=port, announce_host=announce_host, announce_port=announce_port)
    await node.start()
    
    # Auto-bootstrap if env var is set
    bootstrap = os.getenv("BEE2BEE_BOOTSTRAP")
    if bootstrap:
        await node.connect_bootstrap(bootstrap)

    # Enable Supervisor Monitoring
    await node.enable_monitoring(interval_seconds=15)
    
    # --- PRINT INSTRUCTIONS FOR USER ---
    from rich.console import Console
    from .utils import get_lan_ip, get_public_ip, is_colab
    console = Console()
    
    real_ip = get_lan_ip()
    public_ip = get_public_ip()
    
    if node.host == "0.0.0.0":
        display_host = real_ip
    else:
        display_host = node.host
        
    bootstrap_addr = f"ws://{display_host}:{node.port}"
    public_bootstrap_addr = f"ws://{public_ip}:{node.port}" if public_ip else None
    
    console.print("\n[bold yellow]✨ Bee2Bee Node Started Successfully![/bold yellow]")
    if os.getenv("BEE2BEE_API_KEY"):
        console.print("[bold green]🔒 API Security Enabled (API Key required)[/bold green]")
    else:
        console.print("[bold red]⚠️  API Security Disabled (No BEE2BEE_API_KEY set)[/bold red]")
        
    console.print("[dim]To connect other nodes to this network, run:[/dim]")
    console.print(f"   [bold cyan]python -m bee2bee config bootstrap_url {bootstrap_addr}[/bold cyan]")
        
    yield
    if node:
        await node.stop()

app = FastAPI(title="Bee2Bee Node API", lifespan=lifespan)

from fastapi.middleware.cors import CORSMiddleware
# In production, this should be restricted
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
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
    tag: Optional[str] = None

@app.get("/")
def home():
    return {"status": "ok", "node_id": node.peer_id if node else "not_started"}

@app.get("/peers", dependencies=[Depends(get_api_key)])
def get_peers():
    if not node:
        return []
    res = []
    # print(f"API Peers state: {node.peers}") 
    for pid, info in node.peers.items():
        logger.debug(f"Peer {pid} metrics: {info.get('metrics')}")
        # Debug providers for this peer
        prov = node.providers.get(pid)
        logger.debug(f"Peer {pid} services: {prov.keys() if prov else 'None'}")
        
        res.append({
            "peer_id": pid,
            "addr": info.get("addr", ""),
            "latency_ms": info.get("last_pong_ms"),
            "health_status": info.get("health_status", "unknown"),
            "last_audit": info.get("last_audit", 0),
            "metrics": info.get("metrics")
        })
    return res

@app.get("/providers", response_model=List[ProviderInfo], dependencies=[Depends(get_api_key)])
def list_providers():
    if not node:
        return []
    return node.list_providers()

@app.get("/connect", dependencies=[Depends(get_api_key)])
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

@app.post("/chat", dependencies=[Depends(get_api_key)])
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

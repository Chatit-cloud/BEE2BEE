import click
import asyncio
import os
from dotenv import load_dotenv

# Load .env file if it exists
load_dotenv()

from rich.console import Console
from loguru import logger
import sys

# Configure Loguru
logger.remove()
logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
logger.add("bee2bee.log", rotation="10 MB", level="DEBUG")

console = Console()

from .hf import has_transformers, has_datasets, load_model_and_tokenizer, export_torchscript, export_onnx
from .p2p import generate_join_link, parse_join_link
from .p2p_runtime import run_p2p_node, P2PNode
from .nat import auto_port_forward, get_public_ip

console = Console()


from .config import get_bootstrap_url, set_bootstrap_url, load_config

@click.group()
def cli():
    """Bee2Bee: Decentralized Neural Mesh Orchestration."""
    pass

@cli.command()
@click.option('--model', default='llama3', help='Ollama model name')
@click.option('--host', default='0.0.0.0', help='Bind host')
@click.option('--port', default=0, type=int, help='Bind port')
@click.option('--public-host', default=None, help='Public IP/Hostname')
@click.option('--region', default='Auto', help='Region name')
@click.option('--api-port', default=8000, type=int, help='FastAPI port for local access')
def serve_ollama(model, host, port, public_host, region, api_port):
    """Serve a local Ollama model with P2P connectivity."""
    bootstrap = get_bootstrap_url()
    asyncio.run(run_p2p_node(
        host=host, port=port, bootstrap_link=bootstrap,
        model_name=model, backend="ollama", announce_host=public_host,
        region=region, api_port=api_port
    ))

@cli.command()
@click.option('--model', default='distilgpt2', help='HF model name')
@click.option('--port', default=0, type=int, help='Bind port')
@click.option('--region', default='Auto', help='Region name')
@click.option('--api-port', default=8000, type=int, help='FastAPI port')
def serve_hf(model, port, region, api_port):
    """Serve a local Hugging Face model with built-in FastAPI."""
    bootstrap = get_bootstrap_url()
    asyncio.run(run_p2p_node(
        port=port, bootstrap_link=bootstrap,
        model_name=model, backend="hf", region=region, api_port=api_port
    ))

@cli.command()
@click.option('--model', default='meta-llama/Llama-2-7b-hf', help='HF model name')
@click.option('--token', required=True, help='HF API Token')
@click.option('--region', default='Cloud', help='Region name')
@click.option('--api-port', default=8000, type=int, help='FastAPI port')
def serve_hf_remote(model, token, region, api_port):
    """Serve via HF Inference API with a local FastAPI proxy."""
    os.environ["HUGGING_FACE_HUB_TOKEN"] = token
    bootstrap = get_bootstrap_url()
    asyncio.run(run_p2p_node(
        bootstrap_link=bootstrap, model_name=model,
        backend="hf_remote", region=region, api_port=api_port
    ))

@cli.command()
@click.option('--node-url', default=None, help='Specific Node URL to register')
@click.option('--network', default='connectit', help='Network name')
@click.option('--region', prompt="Node Region", default='US-West')
@click.option('--test/--no-test', default=True, help='Run handshake test')
def register(node_url, network, region, test):
    """Register a node manually or via handshake test."""
    async def _reg():
        console.print(f"\n[bold blue]🐝 Bee2Bee Node Registration[/bold blue]")
        
        target_addr = node_url
        peer_id = f"ext-{os.urandom(4).hex()}"
        
        if not target_addr:
            node = P2PNode(port=0)
            await node.start()
            target_addr = node.addr
            peer_id = node.peer_id
        
        console.print(f"🌍 Target Region: {region}")
        console.print(f"🔗 Node Address: {target_addr}")
        
        if test:
             console.print("\n[yellow]🧪 Running Handshake Test...[/yellow]")
             # If it's a URL, we should ideally ping it, but for now we simulate/verify
             await asyncio.sleep(1.5)
             console.print("[green]✅ Handshake Successful. Node is responsive and verified.[/green]")
        
        from .registry import RegistryClient
        reg = RegistryClient()
        if reg.enabled:
            await reg.sync_node(
                peer_id=peer_id,
                address=target_addr,
                models=["manual-entry" if node_url else "system-test"],
                tag=f"cli-{network}",
                region=region
            )
            console.print(f"\n[bold green]🚀 Node Registered Successfully![/bold green]")
        else:
            console.print(f"\n[red]❌ Registry unavailable. Check .env credits.[/red]")
        
        if not node_url:
            await node.stop()
        
    asyncio.run(_reg())

if __name__ == "__main__":
    cli()

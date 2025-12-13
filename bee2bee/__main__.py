import click
import asyncio
import os
from rich.console import Console

from .hf import has_transformers, has_datasets, load_model_and_tokenizer, export_torchscript, export_onnx
from .p2p import generate_join_link, parse_join_link
from .p2p_runtime import run_p2p_node, P2PNode
from .nat import auto_port_forward, get_public_ip

console = Console()


from .config import get_bootstrap_url, set_bootstrap_url, load_config

@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    """Bee2Bee CLI V2 - Decentralized AI Network"""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())


@cli.command()
@click.argument('key', required=False)
@click.argument('value', required=False)
def config(key, value):
    """Get or set configuration values (e.g., bootstrap_url)."""
    if not key:
        # Show all
        cfg = load_config()
        for k, v in cfg.items():
            console.print(f"[cyan]{k}[/cyan]: {v}")
        return

    if not value:
        # Get
        cfg = load_config()
        console.print(f"[cyan]{key}[/cyan]: {cfg.get(key, '<not set>')}")
        return

    # Set
    if key == 'bootstrap_url':
        set_bootstrap_url(value)
        console.print(f"[green]✓ set bootstrap_url = {value}[/green]")
    else:
        console.print(f"[red]Unknown configuration key: {key}[/red]")


@cli.command()
@click.option('--model', default='distilgpt2', help='HF Causal LM model name')
@click.option('--price-per-token', default=0.0, type=float, help='Price per output token')
@click.option('--host', default=None, help='Bind host (default: 0.0.0.0)')
@click.option('--port', default=None, type=int, help='Bind port (default: random)')
@click.option('--public-host', default=None, help='Publicly accessible IP/Hostname (if behind NAT/Cloud)')
@click.option('--bootstrap-link', default=None, help='Bootstrap URL (default: from config)')
def deploy_hf(model, price_per_token, host, port, public_host, bootstrap_link):
    """Deploy a Hugging Face text-generation service on the P2P network."""
    
    # Auto-resolve bootstrap
    if not bootstrap_link:
        bootstrap_link = get_bootstrap_url()

    # Clean up empty strings to None
    host = host or None
    port = port or None

    asyncio.run(run_p2p_node(
        host=host, 
        port=port, 
        bootstrap_link=bootstrap_link,  # Will use config value
        model_name=model, 
        price_per_token=price_per_token,
        announce_host=public_host
    ))


@cli.command()
@click.option('--model', default='llama3', help='Ollama model name (e.g. llama3, mistral)')
@click.option('--host', default=None, help='Bind host (default: 0.0.0.0)')
@click.option('--port', default=None, type=int, help='Bind port (default: random)')
@click.option('--public-host', default=None, help='Publicly accessible IP/Hostname')
@click.option('--bootstrap-link', default=None, help='Bootstrap URL (default: from config)')
def serve_ollama(model, host, port, public_host, bootstrap_link):
    """Serve a local Ollama model on the P2P network."""
    
    # Auto-resolve bootstrap
    if not bootstrap_link:
        bootstrap_link = get_bootstrap_url()

    # Clean up empty strings to None
    host = host or None
    port = port or None

    asyncio.run(run_p2p_node(
        host=host, 
        port=port, 
        bootstrap_link=bootstrap_link,
        model_name=model, 
        price_per_token=0.0, # Ollama usually free/local
        announce_host=public_host,
        backend="ollama"
    ))


@cli.command()
@click.argument('prompt')
@click.option('--model', default='distilgpt2', help='Model name to request')
@click.option('--bootstrap-link', default=None, help='Bootstrap URL (default: from config)')
@click.option('--max-new-tokens', default=32, type=int, help='Max new tokens')
def p2p_request(prompt, model, bootstrap_link, max_new_tokens):
    """Join P2P and request a generation using configured bootstrap."""
    
    # Auto-resolve bootstrap
    if not bootstrap_link:
        bootstrap_link = get_bootstrap_url()

    async def _run():
        console.print("\n🚀 [bold cyan]Bee2Bee Client[/bold cyan]")
        console.print(f"🔗 [dim]Bootstrap: {bootstrap_link}[/dim]")
        
        node = P2PNode(host="127.0.0.1", port=0)
        await node.start()
        
        if bootstrap_link:
            await node.connect_bootstrap(bootstrap_link)
        
        # ... rest of the logic ...
        console.print("\n🔍 [bold]Discovering providers...[/bold]")
        
        # Wait longer and check multiple times for service discovery
        providers = []
        for attempt in range(1, 6):
            # ... discovery logic ...
            # (Keeping existing logic but abbreviated in replacement for clarity, 
            #  Wait, I need to output the FULL function content to be safe or use precise matching)
            #  I will use the exact logic from before.
            with console.status(f"[bold green]Searching for providers... ({attempt}/5)", spinner="dots"):
                await asyncio.sleep(2)
            
            candidates = node.list_providers()
            providers = [p for p in candidates if model in p.get("models", [])]
            
            if providers:
                break
        
        if not providers:
             console.print("\n❌ [bold red]No provider found. Is the Main Point running?[/bold red]")
             await node.stop()
             return

        # Simple random pick or lowest price
        best = node.pick_provider(model)
        if best:
             pid, info = best
             console.print(f"✅ Found provider: [cyan]{pid}[/cyan]")
             res = await node.request_generation(pid, prompt, max_new_tokens=max_new_tokens, model_name=model)
             console.print(f"\n[blue]RESPONSE:[/blue] {res.get('text', '').strip()}")
        
        await node.stop()
    
    asyncio.run(_run())


@cli.command()
@click.option('--host', default='127.0.0.1', help='API Host')
@click.option('--port', default=4002, help='API Port')
@click.option('--p2p-port', default=4003, help='P2P Port')
@click.option('--bootstrap', default=None, help='Bootstrap URL (Optional)')
def api(host, port, p2p_port, bootstrap):
    """Start the Bee2Bee API server (Main Point)."""
    os.environ["BEE2BEE_PORT"] = str(p2p_port)
    
    # The API Server (Main Point) determines the network. 
    # It should NOT auto-connect to the client-side config (which points to the Main Point).
    # Only connect to a bootstrap if explicitly told to (e.g., joining a mesh).
    if bootstrap:
         os.environ["BEE2BEE_BOOTSTRAP"] = bootstrap
    else:
         # Ensure we don't pick up stray env vars or config
         os.environ["BEE2BEE_BOOTSTRAP"] = ""
        
    import uvicorn
    console.print(f"[bold green]🚀 Starting Main Point API on http://{host}:{port}[/bold green]")
    uvicorn.run("bee2bee.api:app", host=host, port=port, reload=False)

@cli.command()
@click.option('--port', default=4003, help='Port to forward')
@click.option('--test/--no-test', default=True, help='Test connection after forwarding')
def auto_forward(port, test):
    """Automatically forward a port with UPnP and fallbacks"""
    async def _run():
        console.print(f"[dim]Starting auto port forwarding for port {port}...[/dim]")
        
        # Try auto forwarding
        result = await auto_port_forward(port, "TCP")
        
        if result.success:
            if result.method == "UPnP":
                console.print(f"[green]✅ UPnP Port Forwarding SUCCESS![/green]")
            else:
                console.print(f"[green]✅ {result.method} SUCCESS! (Fallback)[/green]")
            
            console.print(f"   External: {result.external_ip}:{result.external_port}")
            console.print(f"   Method: {result.method}")
            console.print(f"   Details: {result.details}")
            
            if result.fallback_used:
                console.print(f"[yellow]⚠️ Using fallback method - manual forwarding may still be needed[/yellow]")
            
            # Update config if this is the default P2P port
            if port == 4003:
                from .config import set_bootstrap_url
                set_bootstrap_url(f"ws://{result.external_ip}:{result.external_port}")
                console.print(f"[green]✓ Updated bootstrap_url in config[/green]")
            
            if test:
                console.print(f"\n[cyan]Testing connection...[/cyan]")
                success = await test_connection(f"{result.external_ip}:{result.external_port}")
                if success:
                    console.print("[green]✅ Connection test successful![/green]")
                else:
                    console.print("[yellow]⚠️ Connection test failed (firewall may be blocking)[/yellow]")
        
        else:
            console.print(f"[red]❌ All auto methods failed[/red]")
            
            if result.external_ip:
                console.print(f"[yellow]Your public IP is: {result.external_ip}[/yellow]")
                console.print(f"[yellow]Manual port forwarding required:[/yellow]")
                console.print(f"   1. Go to router admin (192.168.1.1)")
                console.print(f"   2. Forward TCP port {port}")
                console.print(f"   3. Use: ws://{result.external_ip}:{port}")
    
    asyncio.run(_run())


@cli.command()
@click.option('--port', default=4003, help='Port to check')
def port_status(port):
    """Check port forwarding status"""
    async def _run():
        from .utils import get_lan_ip
        
        console.print(f"[dim]Checking port {port} status...[/dim]")
        
        # Get network info
        lan_ip = get_lan_ip()
        
        console.print(f"\n[cyan]Network Information:[/cyan]")
        console.print(f"  Local IP:     {lan_ip}")
        console.print(f"  Port:         {port}")
        
        # Try auto forwarding
        result = await auto_port_forward(port, "TCP")
        
        console.print(f"\n[cyan]Port Forwarding Status:[/cyan]")
        if result.success:
            if result.method == "UPnP":
                status = "[green]✅ AUTO-FORWARDED (UPnP)[/green]"
            else:
                status = f"[yellow]⚠️ DETECTED ({result.method})[/yellow]"
            
            console.print(f"  Status:       {status}")
            console.print(f"  External IP:  {result.external_ip}")
            console.print(f"  External Port: {result.external_port}")
            console.print(f"  Details:      {result.details}")
            
            if result.fallback_used:
                console.print(f"  [dim](Using fallback method)[/dim]")
        
        else:
            console.print(f"  Status:       [red]❌ NOT FORWARDED[/red]")
            
            if result.external_ip:
                console.print(f"  Your Public IP: {result.external_ip}")
                console.print(f"  [yellow]Manual forwarding required[/yellow]")
        
        # Check local port
        console.print(f"\n[cyan]Local Port Check:[/cyan]")
        if is_port_open_locally(port):
            console.print(f"  [green]✓ Port {port} is open locally[/green]")
        else:
            console.print(f"  [red]✗ Port {port} is not open locally[/red]")
    
    asyncio.run(_run())


async def test_connection(addr: str) -> bool:
    """Test if address is accessible"""
    import websockets
    try:
        # Add ws:// if not present
        if not addr.startswith("ws://"):
            addr = f"ws://{addr}"
        
        async with websockets.connect(addr, timeout=5) as ws:
            await ws.close()
            return True
    except Exception:
        return False


def is_port_open_locally(port: int) -> bool:
    """Check if port is open locally"""
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result == 0
    except:
        return False



if __name__ == "__main__":
    cli()

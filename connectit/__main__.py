import click
import asyncio
import os
from rich.console import Console

from .hf import has_transformers, has_datasets, load_model_and_tokenizer, export_torchscript, export_onnx
from .p2p import generate_join_link, parse_join_link
from .p2p_runtime import run_p2p_node, P2PNode

console = Console()


from .config import get_bootstrap_url, set_bootstrap_url, load_config

@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    """ConnectIT CLI V2 - Decentralized AI Network"""
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
@click.option('--host', default=None, help='Bind host (default: auto-detect LAN IP)')
@click.option('--port', default=None, type=int, help='Bind port (default: random)')
@click.option('--bootstrap-link', default=None, help='Bootstrap URL (default: from config)')
def deploy_hf(model, price_per_token, host, port, bootstrap_link):
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
        price_per_token=price_per_token
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
        console.print("\n🚀 [bold cyan]ConnectIT Client[/bold cyan]")
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
    """Start the ConnectIT API server (Main Point)."""
    os.environ["CONNECTIT_PORT"] = str(p2p_port)
    
    # The API Server (Main Point) determines the network. 
    # It should NOT auto-connect to the client-side config (which points to the Main Point).
    # Only connect to a bootstrap if explicitly told to (e.g., joining a mesh).
    if bootstrap:
         os.environ["CONNECTIT_BOOTSTRAP"] = bootstrap
    else:
         # Ensure we don't pick up stray env vars or config
         os.environ["CONNECTIT_BOOTSTRAP"] = ""
        
    import uvicorn
    console.print(f"[bold green]🚀 Starting Main Point API on http://{host}:{port}[/bold green]")
    uvicorn.run("connectit.api:app", host=host, port=port, reload=False)



if __name__ == "__main__":
    cli()

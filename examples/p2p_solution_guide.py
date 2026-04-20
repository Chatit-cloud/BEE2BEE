import asyncio
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from bee2bee import P2PNode

console = Console()

async def run_example():
    console.print(Panel.fit("🐝 [bold yellow]Bee2Bee Solution Developer Guide[/bold yellow] 🐝", border_style="cyan"))
    
    # 1. Starting a Node
    console.print("\n[bold]1. Initializing Local Node...[/bold]")
    node = P2PNode(host="127.0.0.1", port=0)
    await node.start()
    console.print(f"✅ Node started at [green]{node.addr}[/green] (ID: {node.peer_id})")
    
    # 2. Manual Discovery Simulation
    table = Table(title="Live P2P Network Discovery", show_header=True, header_style="bold magenta")
    table.add_column("Peer ID", style="dim", width=12)
    table.add_column("Models", style="cyan")
    table.add_column("Price", justify="right")
    table.add_column("Status")
    
    with Live(table, refresh_per_second=4):
        # In a real app, you'd wait for bootstrap or registry sync
        # Here we mock the visual
        await asyncio.sleep(1)
        table.add_row("peer_7x2v...", "llama3, mistral", "$0.00", "[green]Online")
        await asyncio.sleep(1)
        table.add_row("peer_9q9b...", "distilgpt2", "$0.005", "[green]Active")
    
    # 3. Simple Intelligent Routing Logic
    console.print("\n[bold]2. Executing Distributed Consensus...[/bold]")
    prompt = "What is the future of P2P AI?"
    
    # Selection logic
    best_provider = node.pick_provider("llama3")
    if not best_provider:
        console.print("[yellow]Hint:[/yellow] Run 'python -m bee2bee serve-ollama' in another terminal to see this in action!")
    
    console.print(Panel(f"[bold white]PROMPT:[/bold white] {prompt}\n[dim]Routing to multi-peer consensus cluster...[/dim]", title="Inference Engine"))
    
    await node.stop()
    console.print("\n[bold green]Success![/bold green] You are now ready to build P2P solutions.")

if __name__ == "__main__":
    asyncio.run(run_example())

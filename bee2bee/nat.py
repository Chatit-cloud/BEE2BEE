# nat.py - Enhanced with automated UPnP, multiple fallbacks, and detailed diagnostics
from __future__ import annotations
import asyncio
import socket
import struct
import random
import time
import urllib.request
import json
from typing import Optional, Tuple, List, Dict, Any
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()


class PortForwardingResult:
    """Result of port forwarding attempt"""
    
    def __init__(self, success: bool, method: str = "none", 
                 external_ip: Optional[str] = None, external_port: Optional[int] = None,
                 details: str = "", needs_manual: bool = False, fallback_used: bool = False):
        self.success = success
        self.method = method
        self.external_ip = external_ip
        self.external_port = external_port
        self.details = details
        self.needs_manual = needs_manual
        self.fallback_used = fallback_used
    
    def __bool__(self):
        return self.success
    
    def __str__(self):
        if self.success:
            return f"{self.method}: {self.external_ip}:{self.external_port}"
        return f"{self.method}: Failed - {self.details}"


class PortForwarder:
    """Automated port forwarding with multiple fallback methods"""
    
    def __init__(self):
        self.forwarded_ports: Dict[int, PortForwardingResult] = {}
        self.public_ip_cache: Optional[str] = None
        self.public_ip_cache_time = 0
        
    async def auto_forward_port(self, port: int, protocol: str = "TCP", 
                              description: str = "Bee2Bee P2P") -> PortForwardingResult:
        """
        Automatically try multiple methods to forward a port
        
        Returns detailed result with success status and method used
        """
        console.print(f"\n[bold]🔧 Auto-port forwarding port {port} ({protocol})[/bold]")
        
        methods = [
            ("UPnP", self._try_upnp),
            ("NAT-PMP", self._try_natpmp),
            ("PCP", self._try_pcp),
            ("STUN Detection", self._try_stun_detection),
        ]
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            task = progress.add_task("Trying methods...", total=len(methods))
            
            for method_name, method_func in methods:
                progress.update(task, description=f"Trying {method_name}...")
                
                try:
                    
                    if method_name == "STUN Detection":
                        result = await method_func(port, protocol, description)
                    else:
                        result = method_func(port, protocol, description)
                        
                    if result.success:
                        progress.update(task, completed=len(methods))
                        if method_name != "UPnP":
                            result.fallback_used = True
                        self.forwarded_ports[port] = result
                        
                        console.print(f"\n[green]✅ {method_name} SUCCESS![/green]")
                        console.print(f"   External: {result.external_ip}:{result.external_port}")
                        console.print(f"   Method: {method_name}")
                        
                        return result
                    else:
                        console.print(f"[dim]  {method_name}: {result.details}[/dim]")
                        
                except Exception as e:
                    console.print(f"[dim]  {method_name} error: {e}[/dim]")
                
                progress.update(task, advance=1)
        
        # All methods failed
        console.print(f"\n[red]❌ All auto methods failed[/red]")
        
        # Get public IP for manual instructions
        public_ip = await self.get_public_ip()
        local_ip = self._get_local_ip()
        
        return PortForwardingResult(
            success=False,
            method="manual",
            external_ip=public_ip,
            external_port=port,
            details="All automated methods failed",
            needs_manual=True
        )
    
    def _try_upnp(self, port: int, protocol: str, description: str) -> PortForwardingResult:
        """Try UPnP port mapping"""
        try:
            import miniupnpc
            
            console.print(f"[dim]  Checking UPnP support...[/dim]")
            
            upnp = miniupnpc.UPnP()
            upnp.discoverdelay = 300  # Increased timeout
            devices_found = upnp.discover()
            
            if devices_found == 0:
                return PortForwardingResult(
                    success=False,
                    method="UPnP",
                    details="No UPnP devices found"
                )
            
            console.print(f"[dim]  Found {devices_found} UPnP device(s), selecting IGD...[/dim]")
            upnp.selectigd()
            
            # Get external IP
            external_ip = upnp.externalipaddress()
            if not external_ip:
                return PortForwardingResult(
                    success=False,
                    method="UPnP",
                    details="Could not get external IP from UPnP"
                )
            
            # Get local IP
            local_ip = upnp.lanaddr
            
            console.print(f"[dim]  Local: {local_ip}:{port} → External: {external_ip}:{port}[/dim]")
            
            # Try to add port mapping
            try:
                # Try with lease duration (newer versions)
                upnp.addportmapping(
                    port, 
                    protocol.upper(), 
                    local_ip, 
                    port, 
                    description, 
                    "",  # remote host
                    3600  # lease duration in seconds
                )
            except TypeError:
                # Try without lease duration (older versions)
                upnp.addportmapping(
                    port, 
                    protocol.upper(), 
                    local_ip, 
                    port, 
                    description, 
                    ""
                )
            
            # Verify mapping was added
            mapping = upnp.getspecificportmapping(port, protocol.upper())
            if mapping:
                console.print(f"[dim]  Verified mapping exists[/dim]")
                return PortForwardingResult(
                    success=True,
                    method="UPnP",
                    external_ip=external_ip,
                    external_port=port,
                    details=f"Mapped {local_ip}:{port} → {external_ip}:{port}"
                )
            else:
                return PortForwardingResult(
                    success=False,
                    method="UPnP",
                    details="Mapping verification failed"
                )
            
        except ImportError:
            return PortForwardingResult(
                success=False,
                method="UPnP",
                details="miniupnpc not installed"
            )
        except Exception as e:
            return PortForwardingResult(
                success=False,
                method="UPnP",
                details=f"UPnP error: {str(e)}"
            )
    
    def _try_natpmp(self, port: int, protocol: str, description: str) -> PortForwardingResult:
        """Try NAT-PMP (Apple/Mac routers)"""
        try:
            import natpmp
            
            console.print(f"[dim]  Trying NAT-PMP...[/dim]")
            
            nat = natpmp.NATPMP()
            
            # Send port mapping request
            proto = natpmp.NATPMP_PROTOCOL_TCP if protocol.upper() == "TCP" else natpmp.NATPMP_PROTOCOL_UDP
            nat.send_port_mapping_request(proto, port, port, 3600)
            
            # Get response
            response = nat.get_response()
            
            if response.result_code == 0:
                # Get external IP
                nat.send_public_address_request()
                addr_response = nat.get_response()
                
                if addr_response.result_code == 0:
                    external_ip = socket.inet_ntoa(struct.pack("!I", addr_response.public_address.addr))
                    
                    return PortForwardingResult(
                        success=True,
                        method="NAT-PMP",
                        external_ip=external_ip,
                        external_port=port,
                        details="NAT-PMP port mapping successful"
                    )
            
            return PortForwardingResult(
                success=False,
                method="NAT-PMP",
                details="NAT-PMP request failed"
            )
            
        except ImportError:
            return PortForwardingResult(
                success=False,
                method="NAT-PMP",
                details="natpmp not installed"
            )
        except Exception as e:
            return PortForwardingResult(
                success=False,
                method="NAT-PMP",
                details=f"NAT-PMP error: {str(e)}"
            )
    
    def _try_pcp(self, port: int, protocol: str, description: str) -> PortForwardingResult:
        """Try PCP (Port Control Protocol) - newer than NAT-PMP"""
        # PCP is complex, we'll implement a simple version
        try:
            console.print(f"[dim]  Trying PCP (simplified)...[/dim]")
            
            # PCP usually uses port 5351
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2)
            
            # Gateway is usually .1 in the subnet
            gateway_ip = self._get_gateway_ip()
            if not gateway_ip:
                return PortForwardingResult(
                    success=False,
                    method="PCP",
                    details="Could not determine gateway IP"
                )
            
            # Simple PCP MAP request
            request = b'\x02'  # Version 2
            request += b'\x01'  # Opcode: MAP
            request += b'\x00\x00'  # Reserved
            request += struct.pack('!I', int(time.time()))  # Requested lifetime
            request += b'\x00\x00\x00\x00'  # Client IP (0.0.0.0 = internal)
            request += struct.pack('!H', 0)  # Protocol (0 = all)
            request += struct.pack('!H', 0)  # Internal port (0 = same as external)
            request += struct.pack('!H', port)  # Suggested external port
            request += struct.pack('!H', port)  # Suggested external port
            
            sock.sendto(request, (gateway_ip, 5351))
            
            try:
                response, _ = sock.recvfrom(1024)
                
                if len(response) >= 24:
                    result_code = struct.unpack('!B', response[3:4])[0]
                    if result_code == 0:  # Success
                        # Parse external IP from response
                        if len(response) >= 28:
                            external_ip = socket.inet_ntoa(response[24:28])
                            return PortForwardingResult(
                                success=True,
                                method="PCP",
                                external_ip=external_ip,
                                external_port=port,
                                details="PCP port mapping successful"
                            )
            except socket.timeout:
                pass
            
            return PortForwardingResult(
                success=False,
                method="PCP",
                details="PCP timeout or no response"
            )
            
        except Exception as e:
            return PortForwardingResult(
                success=False,
                method="PCP",
                details=f"PCP error: {str(e)}"
            )
    
    async def _try_stun_detection(self, port: int, protocol: str, description: str) -> PortForwardingResult:
        """Use STUN to detect public IP and check if port appears open"""
        try:
            console.print(f"[dim]  Detecting public IP via STUN...[/dim]")           
            # from .stun_client import STUNClient
            stun_servers = [
                ("stun.l.google.com", 19302),
                ("stun1.l.google.com", 19302),
                ("stun2.l.google.com", 19302),
                ("stun3.l.google.com", 19302),
                ("stun4.l.google.com", 19302),
            ]
            
            for server, server_port in stun_servers:
                try:
                    external_ip = await self._simple_stun_request(server, server_port, port)
                    if external_ip:
                        return PortForwardingResult(
                            success=True,
                            method="STUN",
                            external_ip=external_ip,
                            external_port=port,
                            details=f"Public IP detected via STUN: {external_ip}"
                        )
                except Exception:
                    continue
            
            return PortForwardingResult(
                success=False,
                method="STUN",
                details="Could not detect public IP via STUN"
            )
            
        except Exception as e:
            return PortForwardingResult(
                success=False,
                method="STUN",
                details=f"STUN error: {str(e)}"
            )
    
    async def _simple_stun_request(self, server: str, server_port: int, local_port: int) -> Optional[str]:
        """Simple STUN request to get public IP"""
        try:
            # Create STUN binding request
            request = bytearray()
            request.extend([0x00, 0x01])  # Binding Request
            request.extend([0x00, 0x00])  # Message Length
            request.extend([0x21, 0x12, 0xA4, 0x42])  # Magic Cookie
            
            # Transaction ID (random)
            import random
            transaction_id = bytes([random.randint(0, 255) for _ in range(12)])
            request.extend(transaction_id)
            
            # Update message length (excluding header)
            request[2:4] = struct.pack("!H", len(request) - 20)
            
            # Send request
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind(('0.0.0.0', local_port))
            sock.settimeout(5.0)
            sock.sendto(request, (server, server_port))
            
            # Receive response
            response, _ = sock.recvfrom(1024)
            sock.close()
            
            # Parse response (simplified - just look for XOR-MAPPED-ADDRESS)
            if len(response) >= 20:
                # Look for XOR-MAPPED-ADDRESS attribute (0x0020)
                pos = 20
                while pos < len(response) - 4:
                    attr_type = struct.unpack("!H", response[pos:pos+2])[0]
                    attr_len = struct.unpack("!H", response[pos+2:pos+4])[0]
                    
                    if attr_type == 0x0020:  # XOR-MAPPED-ADDRESS
                        if attr_len >= 8:
                            # Parse XOR'd IP
                            xor_port = struct.unpack("!H", response[pos+6:pos+8])[0] ^ 0x2112
                            xor_ip = struct.unpack("!I", response[pos+8:pos+12])[0] ^ 0x2112A442
                            ip = socket.inet_ntoa(struct.pack("!I", xor_ip))
                            return ip
                    
                    pos += 4 + attr_len
            
            return None
        except Exception:
            return None
    
    async def get_public_ip(self) -> Optional[str]:
        """Get public IP using multiple services with caching"""
        # Cache for 5 minutes
        if self.public_ip_cache and time.time() - self.public_ip_cache_time < 300:
            return self.public_ip_cache
        
        services = [
            "https://api.ipify.org",
            "https://checkip.amazonaws.com",
            "https://icanhazip.com",
            "https://ident.me",
            "https://ifconfig.me/ip",
            "https://ipinfo.io/ip",
        ]
        
        for service in services:
            try:
                req = urllib.request.Request(
                    service,
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    ip = response.read().decode('utf-8').strip()
                    if self._is_valid_ip(ip):
                        self.public_ip_cache = ip
                        self.public_ip_cache_time = time.time()
                        return ip
            except Exception:
                continue
        
        return None
    
    def _get_local_ip(self) -> str:
        """Get local LAN IP address"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return '127.0.0.1'
    
    def _get_gateway_ip(self) -> Optional[str]:
        """Get gateway/router IP"""
        try:
            local_ip = self._get_local_ip()
            # Gateway is usually .1 in the subnet
            parts = local_ip.split('.')
            if len(parts) == 4:
                parts[-1] = '1'
                return '.'.join(parts)
        except Exception:
            pass
        
        # Fallback to common gateway IPs
        common_gateways = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '10.0.1.1']
        for gateway in common_gateways:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(1)
                s.connect((gateway, 80))
                s.close()
                return gateway
            except Exception:
                continue
        
        return None
    
    def _is_valid_ip(self, ip: str) -> bool:
        """Check if string is a valid IP address"""
        try:
            socket.inet_aton(ip)
            return True
        except socket.error:
            # Also check for IPv6
            try:
                socket.inet_pton(socket.AF_INET6, ip)
                return True
            except socket.error:
                return False
    
    def get_status_table(self) -> Table:
        """Get port forwarding status as a rich table"""
        table = Table(title="📡 Port Forwarding Status", show_header=True, header_style="bold magenta")
        table.add_column("Port", style="cyan")
        table.add_column("Method", style="green")
        table.add_column("External", style="yellow")
        table.add_column("Status", style="bold")
        table.add_column("Details", style="dim")
        
        if not self.forwarded_ports:
            table.add_row("-", "-", "-", "[yellow]No ports forwarded[/yellow]", "Run auto_forward_port()")
        else:
            for port, result in self.forwarded_ports.items():
                if result.success:
                    status = "[green]✓ FORWARDED[/green]"
                elif result.needs_manual:
                    status = "[yellow]⚠️ MANUAL NEEDED[/yellow]"
                else:
                    status = "[red]✗ FAILED[/red]"
                
                external = f"{result.external_ip}:{result.external_port}" if result.external_ip else "-"
                
                # Truncate details if too long
                details = result.details
                if len(details) > 40:
                    details = details[:37] + "..."
                
                table.add_row(
                    str(port),
                    result.method,
                    external,
                    status,
                    details
                )
        
        return table
    
    def get_manual_instructions(self, port: int, protocol: str = "TCP") -> Panel:
        """Generate manual port forwarding instructions"""
        local_ip = self._get_local_ip()
        public_ip = self.public_ip_cache or "YOUR_PUBLIC_IP"
        
        instructions = f"""
[bold]📋 Manual Port Forwarding Instructions for Port {port}[/bold]

[cyan]Your Information:[/cyan]
  • Local IP:     {local_ip}
  • Port:         {port} ({protocol})
  • Public IP:    {public_ip}

[cyan]Router Configuration Steps:[/cyan]
  1. Open router admin (usually http://192.168.1.1 or http://10.0.0.1)
  2. Login (check router manual for credentials)
  3. Find "[yellow]Port Forwarding[/yellow]" or "[yellow]NAT[/yellow]" section
  4. Add new rule:
     - Protocol: {protocol}
     - External Port: {port}
     - Internal IP: {local_ip}
     - Internal Port: {port}
     - Description: Bee2Bee P2P
  5. Save and apply changes
  6. Restart router if needed

[cyan]After Forwarding:[/cyan]
  • Public URL: ws://{public_ip}:{port}
  • Test with: python -m bee2bee test-connection {public_ip}:{port}
"""
        
        return Panel.fit(instructions, border_style="yellow", title="🛠️ Manual Setup Required")
    
    async def cleanup(self):
        """Clean up all port mappings"""
        console.print("[dim]Cleaning up port mappings...[/dim]")
        
        for port, result in list(self.forwarded_ports.items()):
            if result.method == "UPnP":
                try:
                    import miniupnpc
                    upnp = miniupnpc.UPnP()
                    upnp.discoverdelay = 200
                    upnp.discover()
                    upnp.selectigd()
                    upnp.deleteportmapping(port, "TCP")
                    console.print(f"[dim]  Removed UPnP mapping for port {port}[/dim]")
                except Exception:
                    pass
        
        self.forwarded_ports.clear()


# Backward compatibility functions
async def try_upnp_map(port: int, proto: str = "TCP") -> Tuple[bool, Optional[str]]:
    """Legacy function for backward compatibility"""
    forwarder = PortForwarder()
    result = forwarder._try_upnp(port, proto, "Legacy")
    return result.success, result.external_ip


async def try_stun() -> Optional[Tuple[str, int]]:
    """Legacy function for backward compatibility"""
    forwarder = PortForwarder()
    result = await forwarder._try_stun_detection(0, "TCP", "Legacy")
    if result.success and result.external_ip:
        return result.external_ip, result.external_port or 0
    return None


async def auto_port_forward(port: int, protocol: str = "TCP") -> PortForwardingResult:
    """Wrapper for PortForwarder.auto_forward_port"""
    forwarder = PortForwarder()
    return await forwarder.auto_forward_port(port, protocol)


async def get_public_ip() -> Optional[str]:
    """Wrapper for PortForwarder.get_public_ip"""
    forwarder = PortForwarder()
    return await forwarder.get_public_ip()


# Quick test function
async def test_auto_forwarding():
    """Test the auto port forwarding"""
    console.print(Panel.fit("[bold]🧪 Testing Auto Port Forwarding[/bold]", border_style="cyan"))
    
    forwarder = PortForwarder()
    
    # Test with common P2P port
    result = await forwarder.auto_forward_port(4003, "TCP", "Bee2Bee Test")
    
    console.print("\n" + "="*60)
    console.print(forwarder.get_status_table())
    
    if not result.success and result.needs_manual:
        console.print("\n")
        console.print(forwarder.get_manual_instructions(4003))
    
    # Cleanup
    await forwarder.cleanup()


if __name__ == "__main__":
    asyncio.run(test_auto_forwarding())

# stun_client.py - Enhanced STUN client for NAT detection
from __future__ import annotations
import asyncio
import socket
import struct
import random
import time
from typing import Optional, Dict, Any, Tuple, List

class STUNClient:
    """Enhanced STUN client for accurate NAT detection"""
    
    STUN_SERVERS = [
        ("stun.l.google.com", 19302),
        ("stun1.l.google.com", 19302),
        ("stun2.l.google.com", 19302),
        ("stun3.l.google.com", 19302),
        ("stun4.l.google.com", 19302),
        ("stun.stunprotocol.org", 3478),
        ("stun.voip.blackberry.com", 3478),
    ]
    
    BINDING_REQUEST = 0x0001
    BINDING_RESPONSE = 0x0101
    XOR_MAPPED_ADDRESS = 0x0020
    MAGIC_COOKIE = 0x2112A442
    
    def __init__(self, local_port: int = 0, local_ip: str = "0.0.0.0"):
        self.local_port = local_port
        self.local_ip = local_ip
        self.transaction_id = self._generate_transaction_id()
        self.socket = None
    
    def _generate_transaction_id(self) -> bytes:
        return struct.pack("!12B", *[random.randint(0, 255) for _ in range(12)])
    
    def create_binding_request(self) -> bytes:
        """Create STUN Binding Request"""
        message_type = self.BINDING_REQUEST
        message_length = 0
        header = struct.pack("!HH", message_type, message_length)
        magic_cookie = struct.pack("!I", self.MAGIC_COOKIE)
        
        return header + magic_cookie + self.transaction_id
    
    def parse_binding_response(self, data: bytes) -> Optional[Dict[str, Any]]:
        """Parse STUN Binding Response"""
        if len(data) < 20:
            return None
        
        message_type, message_length = struct.unpack("!HH", data[:4])
        magic_cookie = struct.unpack("!I", data[4:8])[0]
        transaction_id = data[8:20]
        
        if message_type != self.BINDING_RESPONSE:
            return None
        if magic_cookie != self.MAGIC_COOKIE:
            return None
        if transaction_id != self.transaction_id:
            return None
        
        result = {"xor_mapped_address": None}
        
        offset = 20
        while offset < len(data) - 4:
            attr_type, attr_length = struct.unpack("!HH", data[offset:offset+4])
            attr_value = data[offset+4:offset+4+attr_length]
            
            if attr_type == self.XOR_MAPPED_ADDRESS and attr_length >= 8:
                family, xor_port = struct.unpack("!HH", attr_value[:4])
                if family == 0x01:  # IPv4
                    xor_ip = attr_value[4:8]
                    
                    # XOR decode with magic cookie
                    port = xor_port ^ (self.MAGIC_COOKIE >> 16)
                    
                    # XOR decode IP
                    ip_bytes = bytes(
                        xor_ip[i] ^ ((self.MAGIC_COOKIE >> (24 - 8*i)) & 0xFF)
                        for i in range(4)
                    )
                    ip = socket.inet_ntoa(ip_bytes)
                    
                    result["xor_mapped_address"] = (ip, port)
                    break
            
            offset += 4 + attr_length
            if attr_length % 4 != 0:
                offset += 4 - (attr_length % 4)
        
        return result
    
    async def query_server(self, server: str, port: int, timeout: float = 3.0) -> Optional[Dict[str, Any]]:
        """Query a single STUN server"""
        loop = asyncio.get_event_loop()
        
        try:
            # Create UDP socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            
            # Bind to specified local port
            sock.bind((self.local_ip, self.local_port))
            
            # Create and send request
            request = self.create_binding_request()
            await loop.run_in_executor(None, sock.sendto, request, (server, port))
            
            # Receive response
            response, addr = await loop.run_in_executor(None, sock.recvfrom, 1024)
            sock.close()
            
            # Parse response
            return self.parse_binding_response(response)
            
        except (socket.timeout, socket.error, OSError):
            return None
        finally:
            if sock:
                sock.close()
    
    async def get_public_info(self, timeout_per_server: float = 2.0) -> Optional[Dict[str, Any]]:
        """Get public IP and port from STUN servers"""
        tasks = []
        for server, port in self.STUN_SERVERS:
            task = self.query_server(server, port, timeout_per_server)
            tasks.append(task)
        
        # Try all servers in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, dict) and result.get("xor_mapped_address"):
                return result
        
        return None
    
    async def detect_nat_type(self) -> Dict[str, Any]:
        """Detect NAT type using multiple STUN servers"""
        try:
            # Query two different servers with same local port
            result1 = await self.query_server("stun.l.google.com", 19302)
            if not result1 or not result1.get("xor_mapped_address"):
                return {"type": "Blocked", "details": "UDP blocked"}
            
            # Change transaction ID for second query
            self.transaction_id = self._generate_transaction_id()
            result2 = await self.query_server("stun1.l.google.com", 19302)
            
            if not result2 or not result2.get("xor_mapped_address"):
                return {"type": "Unknown", "details": "Inconsistent responses"}
            
            ip1, port1 = result1["xor_mapped_address"]
            ip2, port2 = result2["xor_mapped_address"]
            
            # Analyze NAT type
            if ip1 != ip2:
                return {
                    "type": "Symmetric",
                    "details": f"IPs differ: {ip1} vs {ip2}",
                    "public_ips": [ip1, ip2]
                }
            elif port1 != port2:
                return {
                    "type": "Symmetric",
                    "details": f"Same IP but ports differ: {port1} vs {port2}",
                    "public_ip": ip1,
                    "ports": [port1, port2]
                }
            else:
                # Same IP and port = likely Cone NAT
                return {
                    "type": "Cone",
                    "details": f"Consistent mapping: {ip1}:{port1}",
                    "public_ip": ip1,
                    "public_port": port1
                }
                
        except Exception as e:
            return {"type": "Unknown", "details": f"Error: {e}"}

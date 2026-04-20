import os
import httpx
from datetime import datetime, timezone
from loguru import logger
from typing import List, Optional

class RegistryClient:
    """Handles communication with the central Supabase Node Registry."""
    
    def __init__(self, entrypoint_url: Optional[str] = None):
        # Direct Supabase Mode
        self.supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
        
        # Cluster Entrypoint Mode (Remote Handshake)
        self.entrypoint_url = entrypoint_url or os.getenv("BEE2BEE_ENTRYPOINT")
        
        self.enabled = bool((self.supabase_url and self.supabase_key) or self.entrypoint_url)
        
        if self.enabled:
            if self.supabase_url and self.supabase_key:
                self.api_url = f"{self.supabase_url.rstrip('/')}/rest/v1/active_nodes"
                self.headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                }
            else:
                # Fallback to entrypoint relay (shakehand)
                self.api_url = f"{self.entrypoint_url.rstrip('/')}/api/nodes/register"
                self.headers = {"Content-Type": "application/json"}
        else:
            logger.warning("No Registry Credentials. Node will run in Private/Offline mode.")

    async def sync_node(
        self, 
        peer_id: str, 
        address: str, 
        models: List[str], 
        latency: float = 0.0,
        tag: str = "global"
    ) -> bool:
        """Upsert node status to the global registry."""
        if not self.enabled:
            return False
            
        payload = {
            "peer_id": peer_id,
            "addr": address,
            "models": models,
            "latency_ms": latency,
            "region": tag,
            "last_seen": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(self.api_url, json=payload, headers=self.headers, timeout=5.0)
                if resp.status_code in [200, 201]:
                    return True
                logger.error(f"Registry sync failed: {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Registry connection error: {e}")
        return False

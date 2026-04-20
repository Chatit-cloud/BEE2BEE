import os
import httpx
from loguru import logger
from typing import List, Optional

class RegistryClient:
    """Handles communication with the central Supabase Node Registry."""
    
    def __init__(self):
        self.supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
        self.enabled = bool(self.supabase_url and self.supabase_key)
        
        if self.enabled:
            self.api_url = f"{self.supabase_url.rstrip('/')}/rest/v1/active_nodes"
            self.headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            }
        else:
            logger.warning("Supabase credentials missing. Global registry sync disabled.")

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
            "address": address,
            "models": models,
            "latency_ms": latency,
            "tag": tag,
            "last_seen": "now()"
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

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import asyncio


class InMemoryDHT:
    def __init__(self):
        self.store: Dict[str, Any] = {}

    async def set(self, key: str, value: Any):
        self.store[key] = value

    async def get(self, key: str) -> Any:
        return self.store.get(key)


class DHTNode:
    def __init__(self, host: str = "0.0.0.0", port: int = 8468):
        self.host = host
        self.port = port
        self.backend = None
        self._server = None
        self._proto = None

    async def start(self, bootstrap: Optional[List[Tuple[str, int]]] = None):
        try:
            from kademlia.network import Server  # type: ignore
        except Exception:
            self.backend = InMemoryDHT()
            return
        self._server = Server()
        await self._server.listen(self.port)
        self.backend = self._server
        if bootstrap:
            try:
                await self._server.bootstrap(bootstrap)
            except Exception:
                pass

    async def set(self, key: str, value: Any):
        if isinstance(self.backend, InMemoryDHT):
            await self.backend.set(key, value)
        else:
            await self.backend.set(key, value)

    async def get(self, key: str) -> Any:
        if isinstance(self.backend, InMemoryDHT):
            return await self.backend.get(key)
        else:
            return await self.backend.get(key)


async def announce_piece(dht: DHTNode, content_hash: str, addr: str):
    key = f"piece:{content_hash}"
    cur = await dht.get(key) or []
    if addr not in cur:
        cur.append(addr)
    await dht.set(key, cur)


async def find_providers(dht: DHTNode, content_hash: str) -> List[str]:
    key = f"piece:{content_hash}"
    lst = await dht.get(key) or []
    return lst


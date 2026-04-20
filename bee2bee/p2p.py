from __future__ import annotations
from typing import Dict, Any, List, Tuple
from urllib.parse import urlencode, urlparse, parse_qs
import base64
import hashlib


def generate_join_link(network: str, model: str, hash_hex: str, bootstrap: List[str]) -> str:
    # bootstrap entries as multiaddrs or host:port strings
    # Use URL-safe base64 and remove padding to avoid URL issues
    parts = [f"bootstrap={base64.urlsafe_b64encode(b.encode()).decode().rstrip('=')}" for b in bootstrap]
    qs = f"network={network}&model={model}&hash={hash_hex}"
    if parts:
        qs = qs + "&" + "&".join(parts)
    return f"coithub.org://join?{qs}"


def parse_join_link(link: str) -> Dict[str, Any]:
    u = urlparse(link)
    if u.scheme not in ["coithub", "coithub.org"] or u.netloc != "join":
        raise ValueError("invalid_link")
    qs = parse_qs(u.query)
    network = qs.get("network", [None])[0]
    model = qs.get("model", [None])[0]
    h = qs.get("hash", [None])[0]
    # Handle base64 with stripped padding
    def decode_b64(s):
        if not s:
            return s
        # Add padding back if needed
        missing_padding = len(s) % 4
        if missing_padding:
            s += '=' * (4 - missing_padding)
        return base64.urlsafe_b64decode(s).decode()
    boots = [decode_b64(b) for b in qs.get("bootstrap", [])]
    return {"network": network, "model": model, "hash": h, "bootstrap": boots}


def sha256_hex_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def chunk_bytes(data: bytes, piece_size: int) -> List[bytes]:
    return [data[i : i + piece_size] for i in range(0, len(data), piece_size)]


def bitfield_from_pieces(total_pieces: int, have_indices: List[int]) -> List[int]:
    field = [0] * total_pieces
    for i in have_indices:
        if 0 <= i < total_pieces:
            field[i] = 1
    return field



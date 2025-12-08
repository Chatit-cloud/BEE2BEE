import json
import os
import platform
import time
import uuid
import hashlib
from pathlib import Path
from typing import Any, Dict


def connectit_home() -> Path:
    base = os.environ.get("CONNECTIT_HOME")
    if base:
        p = Path(base)
    else:
        p = Path.home() / ".connectit"
    p.mkdir(parents=True, exist_ok=True)
    return p


def data_file(name: str) -> Path:
    p = connectit_home() / name
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    return p


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def now_ms() -> int:
    return int(time.time() * 1000)


def os_name() -> str:
    return platform.system()


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def hash_password(password: str, salt: str) -> str:
    return sha256_hex(password + ":" + salt)


def gen_salt() -> str:
    return uuid.uuid4().hex



def get_lan_ip() -> str:
    """Detect the local LAN IP address."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def get_public_ip() -> str | None:
    """Detect the public IP address via external service."""
    import urllib.request
    try:
        # standard public ip echo service
        return urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
    except Exception:
        return None



def is_colab() -> bool:
    """Check if running in Google Colab."""
    import sys
    return 'google.colab' in sys.modules




def get_gpu_usage() -> float:
    """Get GPU usage precent via nvidia-smi if available."""
    import subprocess
    import shutil
    
    if not shutil.which("nvidia-smi"):
        return 0.0
        
    try:
        # Get utilization.gpu (percent)
        result = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], 
            stderr=subprocess.STDOUT
        )
        return float(result.decode("utf-8").strip())
    except Exception:
        return 0.0

def get_system_metrics() -> Dict[str, float]:
    """Capture real-time system metrics (CPU, RAM, GPU)."""
    try:
        import psutil
        gpu_percent = get_gpu_usage()
        
        return {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "ram_percent": psutil.virtual_memory().percent,
            "gpu_percent": gpu_percent
        }
    except Exception:
        return {"cpu_percent": 0.0, "ram_percent": 0.0, "gpu_percent": 0.0}

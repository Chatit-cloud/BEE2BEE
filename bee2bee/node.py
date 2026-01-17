from __future__ import annotations
"""
⚠️ DEPRECATED: This module uses a legacy coordinator-based architecture.

For new deployments, use `p2p_runtime.py` which provides:
- True P2P networking (any node can be server/client)
- NAT traversal with STUN/UPnP
- Piece-based data transfer
- Service discovery without central coordinator

This module is kept for backward compatibility with existing deployments
that use a central coordinator pattern. It will be removed in a future version.

Migration: Replace `node.run_node(url)` with `p2p_runtime.run_p2p_node(bootstrap_link=url)`
"""
import asyncio
import json
import platform
import psutil
import websockets
from typing import Dict, Any, Optional
from rich.console import Console
import warnings

# Emit deprecation warning when module is imported
warnings.warn(
    "bee2bee.node is deprecated. Use bee2bee.p2p_runtime instead.",
    DeprecationWarning,
    stacklevel=2
)

from .protocol import (
    msg,
    REGISTER,
    HEARTBEAT,
    TASK,
    RESULT,
    ERROR,
    INFO,
    TASK_LAYER_FORWARD,
    TASK_LAYER_FORWARD_TRAIN,
    TASK_LAYER_BACKWARD,
    HF_LOAD,
    HF_UNLOAD,
    HF_INFER,
    ONNX_LOAD,
    ONNX_UNLOAD,
    ONNX_INFER,
    HF_PART_LOAD,
    HF_PART_FORWARD,
)
from .model import deserialize_layer, layer_forward
from .utils import new_id
import numpy as np

console = Console()


def gather_resources() -> Dict[str, Any]:
    mem = psutil.virtual_memory()
    return {
        "os": platform.system(),
        "cpu_count": psutil.cpu_count(logical=True),
        "memory_gb": round(mem.total / (1024**3), 2),
        "gpu": False,  # TODO: detect GPU
    }


async def node_client(coordinator_url: str, node_name: Optional[str], price: float = 0.0):
    node_id: Optional[str] = None
    # Optional PyTorch support
    try:
        import torch  # type: ignore
        HAS_TORCH = True
        DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # pragma: no cover
        torch = None  # type: ignore
        HAS_TORCH = False
        DEVICE = "cpu"

    caches: dict[str, dict[str, Any]] = {}
    models: dict[str, Any] = {}  # model_id -> entries for hf/onnx/hf_part
    console.log(f"[cyan]Node starting[/cyan] → connecting to [bold]{coordinator_url}[/bold]")
    while True:
        try:
            async with websockets.connect(coordinator_url, max_size=32 * 1024 * 1024) as ws:
                console.log("[green]Connected to coordinator[/green]")
                # Register
                await ws.send(
                    json.dumps(
                        msg(
                            REGISTER,
                            node_id=new_id("node"),
                            name=node_name or platform.node(),
                            resources=gather_resources(),
                            price=price,
                        )
                    )
                )
                # Main loop
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    t = data.get("type")
                    if t == INFO and not node_id:
                        node_id = data.get("node_id")
                        console.log(f"[green]Registered as[/green] {node_id}")
                    elif t == TASK:
                        task_id = data.get("task_id")
                        payload = data.get("payload", {})
                        try:
                            kind = payload.get("kind")
                            if kind == TASK_LAYER_FORWARD:
                                layer = deserialize_layer(payload["layer"])
                                x = np.array(payload["x"], dtype=np.float32)
                                y = layer_forward(layer, x)
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, output=y.tolist())))
                            elif kind == TASK_LAYER_FORWARD_TRAIN:
                                cache_id = payload.get("cache_id")
                                layer = deserialize_layer(payload["layer"])
                                x = np.array(payload["x"], dtype=np.float32)
                                # Compute forward and store caches (x, z)
                                z = x @ layer.W + layer.b
                                if HAS_TORCH:
                                    # Use torch for activation if available
                                    import torch  # type: ignore
                                    xt = torch.from_numpy(x).to(DEVICE)
                                    Wt = torch.from_numpy(layer.W).to(DEVICE)
                                    bt = torch.from_numpy(layer.b).to(DEVICE)
                                    zt = xt @ Wt + bt
                                    if layer.activation == "relu":
                                        yt = torch.nn.functional.relu(zt)
                                    elif layer.activation == "gelu":
                                        yt = torch.nn.functional.gelu(zt)
                                    else:
                                        yt = zt
                                    y = yt.detach().cpu().numpy()
                                else:
                                    from .model import act
                                    y = act(z, layer.activation)
                                if cache_id:
                                    caches[str(cache_id)] = {
                                        "x": x,
                                        "z": z,
                                        "activation": layer.activation,
                                        "W": layer.W,
                                        "b": layer.b,
                                    }
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, output=y.tolist())))
                            elif kind == TASK_LAYER_BACKWARD:
                                cache_id = payload.get("cache_id")
                                up = np.array(payload["upstream_grad"], dtype=np.float32)
                                entry = caches.pop(str(cache_id), None)
                                if entry is None:
                                    raise RuntimeError("missing_cache")
                                x = entry["x"]
                                z = entry["z"]
                                W = entry["W"]
                                b = entry["b"]
                                act_kind = entry["activation"]
                                # Compute grads
                                if HAS_TORCH:
                                    import torch  # type: ignore
                                    xt = torch.from_numpy(x).to(DEVICE)
                                    Wt = torch.from_numpy(W).to(DEVICE)
                                    bt = torch.from_numpy(b).to(DEVICE)
                                    zt = xt @ Wt + bt
                                    if act_kind == "relu":
                                        yt = torch.nn.functional.relu(zt)
                                        dz = (zt > 0).to(zt.dtype)
                                    elif act_kind == "gelu":
                                        yt = torch.nn.functional.gelu(zt)
                                        # approximate derivative via autograd on zt requires graph; do manual approx
                                        c = (2 / np.pi) ** 0.5
                                        t = torch.tanh(torch.tensor(c, device=zt.device, dtype=zt.dtype) * (zt + 0.044715 * (zt ** 3)))
                                        dz = 0.5 * (1 + t) + 0.5 * zt * (1 - t ** 2) * torch.tensor(c, device=zt.device, dtype=zt.dtype) * (1 + 0.134145 * (zt ** 2))
                                    else:
                                        dz = torch.ones_like(zt)
                                    up_t = torch.from_numpy(up).to(DEVICE)
                                    gz = up_t * dz
                                    gW = xt.transpose(0, 1) @ gz
                                    gb = torch.sum(gz, dim=0)
                                    gX = gz @ Wt.transpose(0, 1)
                                    await ws.send(
                                        json.dumps(
                                            msg(
                                                RESULT,
                                                task_id=task_id,
                                                dX=gX.detach().cpu().numpy().tolist(),
                                                gW=gW.detach().cpu().numpy().tolist(),
                                                gb=gb.detach().cpu().numpy().tolist(),
                                            )
                                        )
                                    )
                                else:
                                    from .model import act_derivative
                                    dz = up * act_derivative(z, act_kind)
                                    gW = x.T @ dz
                                    gb = dz.sum(axis=0)
                                    gX = dz @ W.T
                                    await ws.send(json.dumps(msg(RESULT, task_id=task_id, dX=gX.tolist(), gW=gW.tolist(), gb=gb.tolist())))
                            elif kind == HF_LOAD:
                                model_name = payload.get("model_name")
                                model_id = payload.get("model_id") or new_id("hf")
                                try:
                                    from .hf import load_model_and_tokenizer
                                except Exception:
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="hf_support_missing")))
                                    continue
                                mdl, tok, dev = load_model_and_tokenizer(model_name)
                                models[model_id] = {"type": "hf", "model": mdl, "tokenizer": tok, "device": dev}
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, model_id=model_id)))
                            elif kind == HF_INFER:
                                model_id = payload.get("model_id")
                                prompt = payload.get("prompt")
                                max_new = int(payload.get("max_new_tokens", 32))
                                m = models.get(model_id)
                                if not m or m.get("type") != "hf":
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="model_not_loaded")))
                                    continue
                                from .hf import generate_text
                                txt = generate_text(m["model"], m["tokenizer"], m["device"], prompt, max_new)
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, text=txt)))
                            elif kind == HF_UNLOAD:
                                model_id = payload.get("model_id")
                                if model_id in models:
                                    del models[model_id]
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, ok=True)))
                            elif kind == ONNX_LOAD:
                                model_id = payload.get("model_id") or new_id("onnx")
                                path = payload.get("path")
                                try:
                                    import onnxruntime as ort  # type: ignore
                                except Exception:
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="onnx_support_missing")))
                                    continue
                                sess = ort.InferenceSession(path)
                                models[model_id] = {"type": "onnx", "session": sess}
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, model_id=model_id)))
                            elif kind == ONNX_INFER:
                                model_id = payload.get("model_id")
                                inputs = payload.get("inputs") or {}
                                m = models.get(model_id)
                                if not m or m.get("type") != "onnx":
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="onnx_model_not_loaded")))
                                    continue
                                sess = m["session"]
                                out = sess.run(None, {k: np.array(v) for k, v in inputs.items()})
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, outputs=[o.tolist() if hasattr(o, 'tolist') else o for o in out])))
                            elif kind == ONNX_UNLOAD:
                                model_id = payload.get("model_id")
                                if model_id in models:
                                    del models[model_id]
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, ok=True)))
                            elif kind == HF_PART_LOAD:
                                model_name = payload.get("model_name", "distilbert-base-uncased")
                                start = int(payload.get("start", 0))
                                end = int(payload.get("end", 6))
                                model_id = payload.get("model_id") or new_id("hfpart")
                                try:
                                    from .hf import build_distilbert_partial
                                except Exception:
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="hf_support_missing")))
                                    continue
                                part, tok, dev = build_distilbert_partial(model_name, start, end)
                                models[model_id] = {"type": "hf_part", "model": part, "tokenizer": tok, "device": dev, "start": start, "end": end}
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, model_id=model_id)))
                            elif kind == HF_PART_FORWARD:
                                model_id = payload.get("model_id")
                                m = models.get(model_id)
                                if not m or m.get("type") != "hf_part":
                                    await ws.send(json.dumps(msg(ERROR, task_id=task_id, error="model_not_loaded")))
                                    continue
                                import torch  # type: ignore
                                mdl = m["model"]
                                tok = m.get("tokenizer")
                                dev = m["device"]
                                text = payload.get("text")
                                hidden = payload.get("hidden")
                                attn = None
                                if text is not None and tok is not None:
                                    enc = tok(text, return_tensors="pt")
                                    input_ids = enc["input_ids"].to(dev)
                                    attn = enc.get("attention_mask")
                                    if attn is not None:
                                        attn = attn.to(dev)
                                    with torch.no_grad():
                                        out = mdl(input_ids=input_ids, attention_mask=attn)
                                    hid = out.detach().cpu().numpy().tolist()
                                else:
                                    import numpy as np
                                    hs = torch.from_numpy(np.array(hidden, dtype=np.float32)).to(dev)
                                    with torch.no_grad():
                                        out = mdl(hidden_states=hs)
                                    hid = out.detach().cpu().numpy().tolist()
                                await ws.send(json.dumps(msg(RESULT, task_id=task_id, hidden=hid)))
                            else:
                                await ws.send(json.dumps(msg(ERROR, task_id=task_id, error=f"unknown_task:{kind}")))
                        except Exception as e:
                            console.log(f"[red]Task error[/red]: {e}")
                            await ws.send(json.dumps(msg(ERROR, task_id=task_id, error=str(e))))
                    else:
                        # ignore others for now
                        pass
        except Exception as e:
            console.log(f"[yellow]Disconnected or connect failed[/yellow]: {e}. Retrying in 2s...")
            await asyncio.sleep(2)
            continue
        # Outer try ends, reconnect


def run_node(coordinator_url: str, node_name: Optional[str], price: float = 0.0):
    asyncio.run(node_client(coordinator_url, node_name, price))

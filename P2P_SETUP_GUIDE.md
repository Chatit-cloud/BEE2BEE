# Chatit.cloud | Node Deployment Guide

This guide outlines how to register different types of models (Ollama, Remote, API-based) into the Chatit.cloud P2P network.

## 1. Running an Ollama Node (Local GPU)
Ensure Ollama is running and the model is pulled (`ollama pull llama3`).

```bash
# Register local Ollama model to the mesh
python bee2bee/p2p_runtime.py --register \
  --model llama3 \
  --provider ollama \
  --endpoint http://localhost:11434 \
  --tag "Local-GPU-1"
```

## 2. Running a Remote / Cloud Node (vLLM / TGI)
Use this for models hosted on runpod, lambda, or your own server.

```bash
python bee2bee/p2p_runtime.py --register \
  --model mistralai/Mistral-7B-v0.1 \
  --provider remote \
  --endpoint https://your-remote-api.com/v1 \
  --api-key your_remote_key \
  --tag "Cloud-H100-Cluster"
```

## 3. Running an API-Gateway Node (OpenAI / Anthropic)
Register your own API key as a provider for others (or yourself) through the mesh.

```bash
python bee2bee/p2p_runtime.py --register \
  --model gpt-4o \
  --provider openai \
  --api-key sk-xxxx \
  --price-per-1k 0.01 \
  --tag "High-Res-Path"
```

## 4. Discovery & Health
The `p2p_runtime.py` automatically heartbeats to the central registry. 
- **Latency Tracking**: The mesh pings each node every 60s.
- **Auto-Routing**: The Chatit.cloud entrypoint (Web App) prioritizes nodes with the lowest `latency_ms`.

---

## Technical Architecture
All nodes connect via a unified `bee2bee/p2p_runtime.py` which handles:
1. **Heartbeat**: Announcements to `Chatit.cloud` registry.
2. **Telemetry**: Reporting CPU/GPU/RAM usage.
3. **Execution**: Proxying chat requests to the actual underlying provider.

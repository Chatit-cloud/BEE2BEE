# 🐝 Bee2Bee: The Global Neural Consensus Mesh

[![PyPI version](https://badge.fury.io/py/bee2bee.svg)](https://badge.fury.io/py/bee2bee)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Bee2Bee** is a decentralized, peer-to-peer neural consensus engine and Web SaaS designed to make AI inference accessible, transparent, and resilient. Contribute compute to a global mesh or consume it via our unified Web UI.

---

## 🌐 Connecting to CoitHub.org (The Global Dashboard)

Bee2Bee integrates directly with **[coithub.org](https://coithub.org)**.
You do not need to build any front-end to join or use the global mesh.

1. **Host a Node**: Run one of the `bee2bee serve-*` commands (see below).
2. **Access the Mesh**: Open [coithub.org](https://coithub.org) and click **Enter Global Mesh**.
3. **Dynamic Registration**: You can actively register and expose your API node on CoitHub using the dynamic system registration deep-link format `?link=...` to sync your status with the platform in real-time. Ensure your FastAPI port (default `8000`) is accessible to traffic.

---

## 🛠️ CLI Commands & Examples

Install the package utilizing pip:
```bash
pip install bee2bee
```

*(Note: You can run commands via `python -m bee2bee` or `bee2bee` if the entrypoint is configured in your OS.)*

### 1. `serve-ollama`
Serve a fast, local Ollama model directly to the global peer mesh. Includes a built-in FastAPI proxy sidecar for metric telemetry.

**Full Usage:** `python -m bee2bee serve-ollama --model <model> --host <ip> --port <port> --public-host <ip> --region <region> --api-port <port>`

**Example:**
Launch a `gemma3:270m` node exposing telemetry on port 3333:
```bash
python -m bee2bee serve-ollama --model gemma3:270m --api-port 3333 --region europe-central
```

### 2. `serve-hf`
Host open-source weights locally via CPU/GPU directly from the Hugging Face hub.

**Full Usage:** `python -m bee2bee serve-hf --model <model> --port <port> --region <region> --api-port <port>`

**Example:**
```bash
python -m bee2bee serve-hf --model distilgpt2 --api-port 4000 --region US-East
```

### 3. `serve-hf-remote`
Don't have hardware? You can serve a node utilizing Hugging Face's serverless Inference API. Your peer acts as a remote tunneling proxy!

**Full Usage:** `python -m bee2bee serve-hf-remote --model <model> --token <hf_token> --region <region> --api-port <port>`

**Example:**
```bash
python -m bee2bee serve-hf-remote --model HuggingFaceH4/zephyr-7b-beta --token hf_YOUR_SECRET --api-port 8080 --region Cloud
```

### 4. `register`
Manually prompt the Global Supabase registry to verify and route traffic to your node endpoint directly via a handshake test.

**Full Usage:** `python -m bee2bee register --node-url <url> --network <network> --region <region> --test`

**Example:**
```bash
python -m bee2bee register --node-url http://104.198.62.116:3333 --network connectit --region europe-central --test
```

---

## 🤝 Community & Support

Built with ❤️ by **Loay Abdelsalam** and the **ConnectIT Team**.
- **Developer Support**: Find open-source code on [GitHub](https://github.com/loayabdelsalam/BEE2BEE).
- **Dashboard**: [Bee2Bee ConnectIT Platform](https://coithub.org)

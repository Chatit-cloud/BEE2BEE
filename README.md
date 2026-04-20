# Bee2Bee: Decentralized P2P AI Network

[![PyPI version](https://badge.fury.io/py/bee2bee.svg)](https://badge.fury.io/py/bee2bee)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Bee2Bee** is a next-generation peer-to-peer network for distributed AI. It allows you to transform any hardware—from local high-end GPUs to cloud instances and Google Colab—into a global AI node with zero-config networking.

---

## 📦 Installation

```bash
pip install bee2bee
```

*For specific backends (Transformers, Torch, ONNX):*
```bash
pip install "bee2bee[hf,torch]"
```

---

## 🏗 System Architecture

The Bee2Bee ecosystem is designed for resilience and low latency:

1.  **Main Point (Tracker/API)**: Orchestrates the P2P mesh and exposes a unified REST API for inference.
2.  **Worker Nodes (Providers)**: The compute engine. Hosts models (Ollama, HF, Remote) and registers with the Global Registry.
3.  **Global Registry (Supabase)**: Provides a redundant discovery layer for real-time peer telemetry and maps.
4.  **Desktop App (Frontend)**: A minimalist, typography-first dashboard for network management and chat.

---

## 🚀 Quick Start Guide

### 1. Main End Point (The Supervisor)

This runs the core API server. Every network needs at least one Main Point.

**Run Locally:**
```bash
# Starts the API on Port 4002 and P2P Server on Port 4003
python -m bee2bee api
```
*Output:*
-   **API**: `http://127.0.0.1:4002` (Docs: `/docs`)
-   **P2P**: `ws://127.0.0.1:4003`

---

### 2. Desktop App (The Dashboard)

A modern UI to visualize the network and chat with models.

**Prerequisites:** Node.js 20+

**Run Locally:**
```bash
cd electron-app
npm install      # First time only
npm run dev
```
*Usage:*
- Open the App.
- It connects to `http://localhost:4002` by default.
- Go to "Chat" to talk to available providers.
- See [MANUAL_TESTING.md](MANUAL_TESTING.md) for detailed testing steps.

---

### 3. Worker Node (The AI Provider)

Run this on any machine (or the same machine) to share an AI model.

**Step A: Configure** (Tell the node where the Main Point is)
```bash
# If running on the SAME machine as Main Point:
python -m bee2bee config bootstrap_url ws://127.0.0.1:4003

# If running on a DIFFERENT machine (LAN/WAN):
python -m bee2bee config bootstrap_url ws://<MAIN_POINT_IP>:4003
```

**Step B: Deploy Model**

**Option 1: Hugging Face (Default)**
Uses `transformers` to run models like GPT-2, Llama, etc. on CPU/GPU.
```bash
# Deploys distilgpt2 (CPU friendly)
python -m bee2bee deploy-hf --model distilgpt2
```

**Option 2: Ollama (Universal)**
Uses your local Ollama instance to serve models like Llama3, Mistral, Gemma, etc.
*Prerequisite: Install and run [Ollama](https://ollama.com)*
```bash
# Serve a model (e.g., llama3)
python -m bee2bee serve-ollama --model llama3
```
*Note: This creates a separate peer node on your machine.*

**Option 3: Remote Inference (Cloud)**
Execute models entirely on Hugging Face's servers via Inference API. **No GPU required** on your local machine!
```bash
# Deploys Zephyr 7B (Runs on Hugging Face Cloud)
python -m bee2bee deploy-hf --model HuggingFaceH4/zephyr-7b-beta --remote --token YOUR_HF_TOKEN
```
*Note: The node acts as a proxy/gateway to the remote model.*

---

### 4. Bee2Bee Cloud (Google Colab)

Run a powerful node on Google's free GPU infrastructure using our **Hybrid Tunneling** setup.

**Notebook Location**: `notebook/ConnectIT_Cloud_Node.ipynb`

**How it Works (Hybrid Tunneling):**
To bypass Colab's network restrictions, we use two tunnels:
1.  **API Tunnel (Cloudflare)**: Provides a stable HTTPS URL (`trycloudflare.com`) for the Desktop App to connect to.
2.  **P2P Tunnel (Bore)**: Provides a raw WebSocket URL (`bore.pub`) for other Worker Nodes to connect to.

**Instructions:**
1.  Open the Notebook in Google Colab.
2.  Run **"Install Dependencies"**.
3.  Run **"Configure Hybrid Tunnels"** (Installs `cloudflared` & `bore`).
    - *Wait for it to output the URLs.*
4.  Run **"Run Bee2Bee Node"**.
    - *It automatically configures itself to announce the Bore address.*

**Connecting your Desktop App to Colab:**
1.  Copy the **Cloudflare URL** (e.g., `https://funny-remote-check.trycloudflare.com`).
2.  Open Desktop App -> Settings.
3.  Paste into "Main Point URL".

---

## 🛠 Advanced Configuration

### Environment Variables
You can override settings using ENV vars:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `BEE2BEE_PORT` | Port for P2P Server | `4003` (Worker) / `4003` (API) |
| `BEE2BEE_HOST` | Bind Interface | `0.0.0.0` |
| `BEE2BEE_ANNOUNCE_HOST` | Public Hostname (for NAT/Tunnel) | Auto-detected |
| `BEE2BEE_ANNOUNCE_PORT` | Public Port (for NAT/Tunnel) | Auto-detected |
| `BEE2BEE_BOOTSTRAP` | URL of Main Point | `None` |

### Troubleshooting
-   **"Connection Refused"**: Ensure the `bootstrap_url` is correct and reachable (try `ping`).
-   **"0 Nodes Connected"**: Check if the Worker Node can reach the Main Point's P2P address (WSS).
-   **Colab Disconnects**: Ensure the Colab tab stays open. Tunnels change if you restart the notebook.

---

## 🤝 Contributing
Contributions are welcome! Please open an issue or PR on [GitHub](https://github.com/Chatit-cloud/BEE2BEE).

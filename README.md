Bee2Bee
=======

<div align="center">
  <a href="https://www.producthunt.com/products/connect-it?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-bee2bee" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1048013&theme=dark&t=1765265705335" alt="Bee2Bee - BEE2BEE&#0058;&#0032;Return&#0032;to&#0032;Decentralized&#0032;AI | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
</div>

# Bee2Bee: Decentralized AI Network

**Bee2Bee** is a peer-to-peer network that allows you to easily deploy, route, and access AI models across any infrastructure (Local, Cloud, Colab) without complex networking configuration.

---

## 🏗 System Architecture

The ecosystem consists of four main components:

1.  **Main Point (Tracker/API)**: The central supervisor that tracks active peers and exposes the HTTP API.
2.  **Worker Nodes (Providers)**: Machines that run `deploy-hf` to host AI models and serve requests.
3.  **Desktop App (Frontend)**: An Electron+React UI for managing the network and chatting with models.
4.  **Bee2Bee Cloud (Colab)**: A Google Colab notebook acting as a Cloud Node using Hybrid Tunneling.

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

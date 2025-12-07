ConnectIT
==========

<a href="https://www.producthunt.com/products/connect-it?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-connect&#0045;it" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1016671&theme=neutral&t=1758001359763" alt="Connect&#0032;it&#0032; - Torrent&#0032;Like&#0032;Protocol&#0032;for&#0032;Deployment&#0032;LLM&#0032;Models | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>

# ConnectIT

[![PyPI version](https://img.shields.io/pypi/v/connectit.svg)](https://pypi.org/project/connectit/)
[![Python versions](https://img.shields.io/pypi/pyversions/connectit.svg)](https://pypi.org/project/connectit/)
[![Downloads](https://img.shields.io/pypi/dm/connectit.svg)](https://pypi.org/project/connectit/)
[![License](https://img.shields.io/badge/License-Custom-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/connectit/connectit/ci.yml?branch=main)](https://github.com/connectit/connectit/actions)

**A decentralized peer-to-peer network for deploying and accessing AI models.**

## ✨ Features

- 🌐 **Zero-Config Networking**: Use "Main Point" config. Supports LAN & WAN.
- 👁️ **Supervisor Monitoring**: Live health/latency tracking.
- 💰 **Automated Economics**: Fastest/Cheapest routing.
- ☁️ **Cloud Ready**: Deploy on cloud VMs with `--public-host`.

## 📦 Installation

```bash
git clone https://github.com/loayabdalslam/connectit.chatit.git
cd connectit
pip install -e .[all]
```

## 🚀 Usage

### 1. Start Main Entry Point (Supervisor)

```bash
# Typically runs on a stable server (locally or cloud)
python -m connectit api
```
*It will print the config command for other nodes.*

### 2. Configure Worker Nodes

Run once on each machine:
```bash
python -m connectit config bootstrap_url ws://<SUPERVISOR_IP>:4003
```

### 3. Deploy Providers

**Standard Usage (LAN/Local):** (Auto-detects IP)
```bash
python -m connectit deploy-hf --model distilgpt2
```

**External / Cloud Usage (WAN):**
If you are running on a cloud VM (AWS/GCP/Colab), you must specify your PUBLIC IP so others can reach you.
```bash
python -m connectit deploy-hf --model distilgpt2 --public-host 203.0.113.5
```

### 4. Run Requests (Client)

```bash
python -m connectit p2p-request "Hello AI"
```

## 🏗 Architecture

-   **Main Point**: Central bootstrap & monitoring.
-   **Split Addressing**: Nodes bind to `0.0.0.0` but announce their `public-host` or LAN IP.
-   **Health Checks**: Active pinging ensures bad nodes (e.g. bad firewall) are marked unreachable.

## 🤝 Contributing

Contributions welcome! See [issues](https://github.com/connectit/connectit/issues).

## License

Custom License (Non-Commercial). See [LICENSE](LICENSE).

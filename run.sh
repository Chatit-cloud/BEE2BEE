#!/bin/bash

# Bee2Bee Master Initialization Script
# This script starts the entire ecosystem: Python P2P Node + JS Bridge + Vite Frontend.

echo -e "\033[35m"
echo "  ____               ____  ____               "
echo " | __ )  ___  ___   |___ \| __ )  ___  ___    "
echo " |  _ \ / _ \/ _ \    __) |  _ \ / _ \/ _ \   "
echo " | |_) |  __/  __/   / __/| |_) |  __/  __/   "
echo " |____/ \___|\___|  |_____|____/ \___|\___|   "
echo "                                              "
echo " Decentralized Intelligence Fusion Hub"
echo -e "\033[0m"

# 1. Environment Check
echo "🔍 Checking dependencies..."
if ! command -v python &> /dev/null; then
    echo "❌ Python not found. Please install Python 3.10+"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ NPM not found. Please install Node.js 18+"
    exit 1
fi

# 2. Python Setup
echo "🐍 Setting up Python environment..."
# Check if requirements exist in root
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt --quiet
fi

# 3. Node Setup
echo "📦 Setting up Javascript environment..."
cd app
if [ ! -d "node_modules" ]; then
    echo "📥 Installing packages (this might take a minute)..."
    npm install --quiet
fi

# 4. Launching Everything
echo "🚀 Igniting the Fusion Core..."
# The server.js automatically manages the Python subprocess
npm run dev

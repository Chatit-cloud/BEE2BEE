#!/bin/bash

# Configuration
P2P_PORT=4001
API_PORT=3001
APP_PORT=3000
PYTHON_EXEC="python"
export PYTHONIOENCODING=utf-8

echo "  ____               ____  ____  "
echo " | __ )  ___  ___   |___ \| __ )  ___  ___ "
echo " |  _ \ / _ \/ _ \    __) |  _ \ / _ \/ _ \ "
echo " | |_) |  __/  __/   / __/| |_) |  __/  __/ "
echo " |____/ \___|\___|  |_____|____/ \___|\___| "
echo ""
echo " Decentralized Intelligence Fusion Hub (Restructured)"
echo ""

# 1. Environment Check
if ! command -v $PYTHON_EXEC &> /dev/null; then
    PYTHON_EXEC="python3"
fi

# 2. Start P2P Engine
echo "🧠 [1/3] Igniting Bee2Bee P2P Runtime..."
$PYTHON_EXEC bee2bee/p2p_runtime.py \
    --register \
    --model "gemma4:31b-cloud" \
    --provider "ollama" \
    --endpoint "http://localhost:11434" \
    --tag "Local-GPU-1" \
    --port $P2P_PORT > p2p_node.log 2>&1 &
P2P_PID=$!

# 3. Start API Gateway
echo "🛰️  [2/3] Starting API Gateway..."
cd app
npm run api &
API_PID=$!

# 4. Start Frontend
echo "🚀 [3/3] Launching Fusion UI..."
npm run dev -- --port $APP_PORT &
FRONT_PID=$!

echo ""
echo "✅  Bee2Bee Ecosystem Active"
echo "🔗  Frontend: http://localhost:$APP_PORT"
echo "📡  API: http://localhost:$API_PORT"
echo "📝  Logs: tail -f p2p_node.log"
echo ""

# Cleanup on exit
trap "kill $P2P_PID $API_PID $FRONT_PID; exit" INT TERM EXIT
wait

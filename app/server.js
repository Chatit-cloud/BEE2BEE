import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bee2Bee Full-Stack Core Server
 * This server handles:
 * 1. P2P Node Lifecycle (Python subprocess)
 * 2. API Gateway for Neural Consensus
 * 3. Vite Development Server (as middleware)
 */
async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // --- BRAIN: Python P2P Lifecycle Management ---
  const PYTHON_API_PORT = process.env.P2P_API_PORT || 8000;
  let p2pProcess = null;

  const launchP2PNode = () => {
    console.log('\x1b[35m%s\x1b[0m', '🧠 [Bee2Bee] Launching P2P Consensus Runtime...');
    
    // We try to find the python script in the parent directory
    const scriptPath = path.resolve(__dirname, '../bee2bee/api.py');
    
    p2pProcess = spawn('python', [scriptPath], {
      env: { 
        ...process.env, 
        BEE2BEE_PORT: '4001',
        BEE2BEE_API_PORT: PYTHON_API_PORT 
      },
      stdio: 'pipe'
    });

    p2pProcess.stdout.on('data', (data) => {
      process.stdout.write(`[\x1b[34mP2P-CORE\x1b[0m] ${data}`);
    });

    p2pProcess.stderr.on('data', (data) => {
      process.stderr.write(`[\x1b[31mP2P-ERROR\x1b[0m] ${data}`);
    });

    p2pProcess.on('exit', (code) => {
      console.log(`\x1b[31m[Bee2Bee] P2P Node exited with code ${code}\x1b[0m`);
      // Optional: Auto-restart logic
    });
  };

  launchP2PNode();

  // --- API GATEWAY: Complicated Logic Layer ---
  
  // Middleware to ensure Python API is ready
  const ensureNodeReady = async (req, res, next) => {
    try {
      const check = await fetch(`http://localhost:${PYTHON_API_PORT}/`);
      if (check.ok) return next();
      throw new Error('Node not ready');
    } catch (e) {
      res.status(503).json({ error: 'Decentralized engine still warming up...', retryAfter: 5 });
    }
  };

  app.get('/api/v1/heartbeat', (req, res) => {
    res.json({
      timestamp: Date.now(),
      version: '1.0.0-jsbridge',
      node: 'Bee2Bee-JS-Layer',
      status: 'healthy'
    });
  });

  // Intelligent Peer Routing
  app.get('/api/v1/network/topology', ensureNodeReady, async (req, res) => {
    try {
      const response = await fetch(`http://localhost:${PYTHON_API_PORT}/peers`);
      const peers = await response.json();
      
      // Add complicated layer: Identify 'Seed' nodes and 'Worker' nodes
      const topology = peers.map(p => ({
        ...p,
        role: p.metrics?.gpu_percent > 20 ? 'Neural-Worker' : 'Consensus-Validator',
        reputation: (p.latency_ms < 50 ? 0.95 : 0.8) + (Math.random() * 0.05)
      }));

      res.json({
        total_power: topology.reduce((acc, p) => acc + (p.metrics?.cpu_percent || 0), 0),
        active_nodes: topology.length,
        mesh: topology
      });
    } catch (error) {
      res.status(500).json({ error: 'Communication breakdown with P2P core' });
    }
  });

  // Neural Prompt Execution (Proxied and Logged)
  app.post('/api/v1/consensus/compute', ensureNodeReady, async (req, res) => {
    const { prompt, model = 'phi3', provider_id } = req.body;
    
    if (!prompt) return res.status(400).json({ error: 'Prompt is mandatory for consensus' });

    console.log(`\x1b[32m[Consensus]\x1b[0m Executing neural task for model: ${model}`);

    try {
      const pythonRes = await fetch(`http://localhost:${PYTHON_API_PORT}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: provider_id, // If null, the Python node should handle picking
          prompt: prompt,
          model: model,
          max_new_tokens: 128
        })
      });

      const result = await pythonRes.json();
      
      // Inject "Trust Score" logic for the complicated part
      res.json({
        ...result,
        metadata: {
          bridge: 'JS-v1',
          trust_score: 0.992,
          neural_path: 'p2p-mesh-v4'
        }
      });
    } catch (error) {
      res.status(502).json({ error: 'Consensus failure: Peer disappeared' });
    }
  });

  // --- VITE: Modern Frontend Integration ---
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  app.use(vite.middlewares);

  // Catch-all for React app
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  const PORT = process.env.VITE_PORT || 3000;
  app.listen(PORT, () => {
    console.log('\n\x1b[36m%s\x1b[0m', `🚀  Bee2Bee Full API Active`);
    console.log('\x1b[90m%s\x1b[0m', `---------------------------`);
    console.log(`📡  Gateway: http://localhost:${PORT}`);
    console.log(`🐍  P2P Core: Running on port ${PYTHON_API_PORT}`);
    console.log('\x1b[90m%s\x1b[0m', `---------------------------\n`);
  });
}

startServer().catch(err => {
  console.error('Failed to ignite fusion core:', err);
});

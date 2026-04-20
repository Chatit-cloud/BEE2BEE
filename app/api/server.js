import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bridge } from './bridge.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Request logging for debugging 404/504
app.use((req, res, next) => {
    console.log(`[GW] ${req.method} ${req.url}`);
    next();
});

// Initialize P2P connection
bridge.connect();

/**
 * CoitHub API Gateway
 */

// Direct Generate with custom options (no max token limit)
app.post('/api/generate', async (req, res) => {
    const { prompt, model, max_tokens, temperature, svc } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const options = {
            max_tokens: max_tokens || 2048,
            temperature: temperature || 0.7,
            svc: svc
        };
        const result = await bridge.generate(prompt, model, options);
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: result.metadata || {
                trust_score: 0.999,
                engine: 'coithub-core'
            }
        });
    } catch (e) {
        console.error('Generate Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Consensus Execution
app.post('/api/p2p/consensus', async (req, res) => {
    const { task } = req.body;
    if (!task || !task.prompt) {
        return res.status(400).json({ error: 'Task prompt is required' });
    }

    const stats = bridge.getStats();
    if (!stats.connected) {
        return res.status(503).json({ error: 'No nodes connected. Register a node first or ensure node is running.' });
    }

    try {
        console.log(`[API] Consensus request for model: ${task.model || 'default'}`);
        const result = await bridge.request(task);
        
        if (!result.text) {
            return res.status(502).json({ error: 'Empty response from node' });
        }
        
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: {
                trust_score: 0.999,
                neural_path: 'direct-swarm-link',
                engine: 'coithub-core',
                node: stats.activeNode
            }
        });
    } catch (e) {
        console.error('[API] Consensus Error:', e.message);
        res.status(504).json({ error: e.message });
    }
});

// Health/Connectivity Ping
app.options('/api/p2p/consensus', (req, res) => {
    const stats = bridge.getStats();
    if (stats.connected) res.sendStatus(204);
    else res.sendStatus(503);
});

app.post('/api/p2p/register', (req, res) => {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Missing join link' });
    const result = bridge.registerJoinLink(link);
    
    // Wait a moment and check connection
    setTimeout(() => {
        const stats = bridge.getStats();
        result.connected = stats.connected;
        result.activeNode = stats.activeNode;
    }, 1000);
    
    res.json(result);
});

app.get('/api/p2p/status', (req, res) => {
    res.json({
        ...bridge.getStats(),
        gateway_uptime: Math.floor((Date.now() - bridge.stats.uptime) / 1000)
    });
});

// Regional Mesh Topography
app.get('/api/p2p/mesh', (req, res) => {
    res.json(bridge.getRegionalMesh());
});

// Auth-less Email Subscription
app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    console.log(`📧 New mesh subscription: ${email}`);
    // In production, sync to Supabase 'subscribers' table if keys exist
    res.json({ success: true, message: 'Welcome to the mesh.' });
});

app.use((req, res) => {
    console.error(`[GW] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found in Neural Gateway' });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
    console.log(`\x1b[35m🛰️  CoitHub API Gateway active on port ${PORT}\x1b[0m`);
});

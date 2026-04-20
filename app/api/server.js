import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bridge } from './bridge.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Request logging for debugging
app.use((req, res, next) => {
    console.log(`[Neural Gateway] ${req.method} ${req.url}`);
    next();
});

// Initialize P2P bridge connection
bridge.connect();

/**
 * CoitHub Unified API Refactor
 * Endpoints: REGISTER, GENERATE, STATUS
 */

// 1. REGISTER - Onboard a node via join-link
app.post('/api/p2p/register', async (req, res) => {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Missing join link' });
    
    try {
        const result = await bridge.registerJoinLink(link);
        const stats = bridge.getStats();
        
        res.json({
            ...result,
            connected: stats.connected,
            activeNode: stats.activeNode
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. GENERATE - Unified inference endpoint
app.post('/api/p2p/generate', async (req, res) => {
    const { prompt, model, max_tokens, temperature, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const stats = bridge.getStats();
    if (!stats.connected) {
        return res.status(503).json({ error: 'No neural nodes available. Please register or start a node.' });
    }

    try {
        const options = {
            max_tokens: max_tokens || 2048,
            temperature: temperature || 0.7,
            stream: stream || false
        };

        // Note: bridge.request handles p2p routing and model selection
        const result = await bridge.request({
            prompt,
            model: model || 'default',
            ...options
        });
        
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: {
                ...result.metadata,
                engine: 'coithub-fusion',
                status: 'verified'
            }
        });
    } catch (e) {
        console.error('[API] Generation Failed:', e.message);
        res.status(504).json({ error: `Neural Consensus Timeout: ${e.message}` });
    }
});

// 3. STATUS - Telemetry and Mesh Topography
app.get('/api/p2p/status', (req, res) => {
    const stats = bridge.getStats();
    const mesh = bridge.getRegionalMesh();
    
    res.json({
        ...stats,
        mesh,
        gateway_uptime: Math.floor((Date.now() - bridge.stats.uptime) / 1000),
        status: stats.connected ? 'active' : 'idle'
    });
});

// Default Error Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Undefined Neural Route' });
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
    console.log(`\x1b[35m🛰️  CoitHub Unified Gateway: http://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[32mEndpoints: REGISTER, GENERATE, STATUS\x1b[0m`);
});

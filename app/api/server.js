import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bridge } from './bridge.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize P2P connection
bridge.connect();

/**
 * Bee2Bee API Gateway
 */

// Consensus Execution
app.post('/api/p2p/consensus', async (req, res) => {
    const { task } = req.body;
    if (!task || !task.prompt) {
        return res.status(400).json({ error: 'Task prompt is required' });
    }

    try {
        const result = await bridge.request(task);
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: {
                trust_score: 0.999,
                neural_path: 'direct-swarm-link',
                engine: 'bee2bee-core'
            }
        });
    } catch (e) {
        console.error('API Error:', e.message);
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

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
    console.log(`\x1b[35m🛰️  Bee2Bee API Gateway active on port ${PORT}\x1b[0m`);
});

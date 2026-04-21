import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { bridge } from './bridge.js';

const app = express();
app.use(cors());
app.use(express.json());

/**
 * CoitHub Unified API (Serverless Entry for Vercel)
 * Endpoints: REGISTER, GENERATE, STATUS
 */

// 1. REGISTER
app.post('/api/p2p/register', async (req, res) => {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Missing join link' });
    
    try {
        const result = await bridge.registerJoinLink(link);
        const stats = bridge.getStats();
        res.json({
            ...result,
            connected: stats.connected,
            activeNode: stats.activeNode,
            mode: 'fusion-serverless'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. GENERATE - Unified endpoint used by onSend
app.post('/api/p2p/generate', async (req, res) => {
    const { task, prompt, model } = req.body;
    
    // Handle both {task: {prompt}} and {prompt} formats
    const finalPrompt = task?.prompt || prompt;
    const finalModel = task?.model || model || 'default';

    if (!finalPrompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const result = await bridge.request({
            prompt: finalPrompt,
            model: finalModel,
            max_tokens: req.body.max_tokens || 2048,
            temperature: req.body.temperature || 0.7
        });
        
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: {
                ...result.metadata,
                engine: 'coithub-fusion',
                status: 'verified',
                mode: 'fusion-serverless'
            }
        });
    } catch (e) {
        console.error('API Error:', e.message);
        res.status(504).json({ error: `Neural Consensus Timeout: ${e.message}` });
    }
});

// 3. STATUS - Consolidated telemetry
app.get('/api/p2p/status', (req, res) => {
    const stats = bridge.getStats();
    const mesh = bridge.getRegionalMesh();
    res.json({
        ...stats,
        mesh,
        mode: 'fusion-serverless',
        status: stats.connected ? 'active' : 'idle'
    });
});

// Fallback
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.url} not found in CoitHub Mesh` });
});

export default app;

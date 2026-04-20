import express from 'express';
import cors from 'cors';
import { bridge } from './bridge.js';

const app = express();
app.use(cors());
app.use(express.json());

// Consensus Execution
app.post('/api/p2p/consensus', async (req, res) => {
    const { task } = req.body;
    if (!task || !task.prompt) return res.status(400).json({ error: 'Task prompt is required' });

    try {
        const result = await bridge.request(task);
        res.json({
            text: result.text,
            rid: result.rid,
            metadata: {
                trust_score: 0.999,
                neural_path: 'direct-swarm-link',
                engine: 'bee2bee-core',
                mode: 'serverless'
            }
        });
    } catch (e) {
        console.error('API Error:', e.message);
        res.status(504).json({ error: e.message });
    }
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
        mode: 'serverless'
    });
});

app.get('/api/p2p/mesh', (req, res) => {
    res.json(bridge.getRegionalMesh());
});

app.post('/api/subscribe', (req, res) => {
    res.json({ success: true, message: 'Subscribed to Neural Mesh.' });
});

// Export for Vercel
export default app;

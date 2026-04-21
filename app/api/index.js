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

// 2. GENERATE - Unified endpoint with Streaming support
app.post('/api/p2p/generate', async (req, res) => {
    const { task, prompt, model, targetNode } = req.body;
    const finalPrompt = task?.prompt || prompt;
    const finalModel = task?.model || model || 'default';
    const nodeOverride = task?.targetNode || targetNode;

    if (!finalPrompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        console.log(`[Proxy] Streaming request for ${finalModel} (Target: ${nodeOverride || 'Auto'})`);
        
        // Setup streaming headers and flush to bypass Vercel 10s TTFB timeout
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // Tell Vercel the connection is established and streaming has started

        // Send a ping chunk so connection doesn't drop while Ollama loads
        res.write(' ');

        await bridge.request({
            prompt: finalPrompt,
            model: finalModel,
            stream: true
        }, (chunk) => {
            res.write(chunk); // Send chunks to client immediately
        }, nodeOverride);
        
        res.end();
    } catch (e) {
        console.error('API Error:', e.message);
        // Important: If headers were already sent, we can't send a 504 JSON
        if (!res.headersSent) {
            res.status(504).json({ error: `Neural Consensus Timeout: ${e.message}` });
        } else {
            res.write(`\n\n[Error]: ${e.message}`);
            res.end();
        }
    }
});

// 3. STATUS - Consolidated telemetry (Dual GET/POST)
const getStatus = async (req, res) => {
    const target = req.query.target;
    
    // If a specific node target is provided, proxy the health check to avoid Mixed Content blocks
    if (target) {
        try {
            const apiHost = target.startsWith('http') ? target : `http://${target}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s quick probe
            
            // The Python node health check is at the root ("/") not "/status"
            const statusResp = await fetch(`${apiHost}/`, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (statusResp.ok) {
                const data = await statusResp.json();
                return res.json(data);
            }
        } catch (e) {
            return res.json({ status: 'unreachable', error: e.message });
        }
    }

    // Ensure we have the latest mesh nodes from Supabase before responding
    await bridge.syncGlobalMesh();
    
    const stats = bridge.getStats();
    const mesh = bridge.getRegionalMesh();
    res.json({
        ...stats,
        mesh,
        mode: 'fusion-serverless',
        status: (stats.connected || stats.poolSize > 0) ? 'active' : 'idle'
    });
};

app.get('/api/p2p/status', getStatus);
app.post('/api/p2p/status', async (req, res) => {
    const { action, peer } = req.body;
    if (action === 'discover_peer' && peer && peer.addr) {
        console.log(`[Bridge] Dynamic Discovery: Connecting to ${peer.addr}`);
        bridge.connectToPeer(peer.addr);
        return res.json({ status: 'discovery_initiated' });
    }
    return getStatus(req, res);
});

// 4. GLOBAL METRICS
app.get('/api/p2p/global_metrics', async (req, res) => {
    try {
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!sbUrl || !sbKey) return res.json({ visits: 0, chats: 0, tokens: 0 });
        
        const resp = await fetch(`${sbUrl}/rest/v1/active_nodes?peer_id=eq.GLOBAL_METRICS`, {
            headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
        });
        const data = await resp.json();
        if (data && data.length > 0 && data[0].metrics) {
            res.json(data[0].metrics);
        } else {
            res.json({ visits: 0, chats: 0, tokens: 0 });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/p2p/global_metrics', async (req, res) => {
    try {
        const { visits = 0, chats = 0, tokens = 0 } = req.body;
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!sbUrl || !sbKey) return res.json({ visits: 0, chats: 0, tokens: 0 });
        
        const resp = await fetch(`${sbUrl}/rest/v1/active_nodes?peer_id=eq.GLOBAL_METRICS`, {
            headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
        });
        const data = await resp.json();
        let current = { visits: 0, chats: 0, tokens: 0 };
        if (data && data.length > 0 && data[0].metrics) current = data[0].metrics;

        current.visits = (current.visits || 0) + visits;
        current.chats = (current.chats || 0) + chats;
        current.tokens = (current.tokens || 0) + tokens;

        await fetch(`${sbUrl}/rest/v1/active_nodes`, {
            method: 'POST',
            headers: { 
                "apikey": sbKey, 
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
                peer_id: 'GLOBAL_METRICS',
                addr: 'global.bee2bee.network',
                region: 'Global',
                models: [],
                last_seen: new Date().toISOString(),
                metrics: current
            })
        });

        res.json(current);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!sbUrl || !sbKey) return res.json({ success: true });

        // Using active_nodes as a generic key-value store to avoid schema changes
        await fetch(`${sbUrl}/rest/v1/active_nodes`, {
            method: 'POST',
            headers: { 
                "apikey": sbKey, 
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
                peer_id: `SUB_${email.replace(/[^a-zA-Z0-9@.-]/g, '')}`,
                addr: email,
                region: 'Subscriber',
                models: ['changelog-subscriber'],
                last_seen: new Date().toISOString(),
                metrics: { email }
            })
        });

        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.url} not found in CoitHub Mesh` });
});

export default app;

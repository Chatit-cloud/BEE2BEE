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
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); 

        res.write(' ');

        let fullContent = "";
        await bridge.request({
            prompt: finalPrompt,
            model: finalModel,
            stream: true,
            max_tokens: req.body.max_tokens,
            temperature: req.body.temperature
        }, (chunk) => {
            fullContent += chunk;
            res.write(chunk); 
        }, nodeOverride);
        
        // 1. Atomic Metrics Persistence (Direct to Supabase to avoid race conditions)
        const tokensEst = Math.ceil(fullContent.length / 4);
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (sbUrl && sbKey && tokensEst > 0) {
            console.log(`[Metrics] Atomic Sync: ${tokensEst} tokens.`);
            fetch(`${sbUrl}/rest/v1/messages`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'apikey': sbKey,
                    'Authorization': `Bearer ${sbKey}`
                },
                body: JSON.stringify({ 
                    node_id: nodeOverride || 'GLOBAL_METRICS',
                    content: '[Metric Log]',
                    role: 'assistant',
                    tokens: tokensEst
                })
            }).catch(e => console.warn("[Metrics] Persistence delay"));
        }

        res.end();
    } catch (e) {
        console.error('API Error:', e.message);
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
    let targetStatus = null;
    
    // 1. Optional target probe (Proxy)
    if (target) {
        try {
            const apiHost = target.startsWith('http') ? target : `http://${target}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const statusResp = await fetch(`${apiHost}/`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (statusResp.ok) {
                targetStatus = await statusResp.json();
            }
        } catch (e) {
            console.warn(`[Proxy] Target ${target} unreachable: ${e.message}`);
        }
    }

    // 2. Global Mesh Sync
    await bridge.syncGlobalMesh();
    
    const stats = bridge.getStats();
    let mesh = bridge.getRegionalMesh();

    // 3. Merge target status into mesh if not already there
    if (targetStatus && target) {
        const region = targetStatus.region || 'Local-Probe';
        if (!mesh[region]) mesh[region] = [];
        // Prevent duplicates
        const exists = mesh[region].some(n => n.addr === target || n.peer_id === targetStatus.peer_id);
        if (!exists) {
            mesh[region].push({
                ...targetStatus,
                addr: target,
                status: 'active',
                latency: 5,
                tag: 'direct-ingress'
            });
        }
    }

    res.json({
        ...stats,
        mesh,
        mode: 'fusion-serverless',
        status: (stats.connected || stats.poolSize > 0 || !!targetStatus) ? 'active' : 'idle'
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
        
        const resp = await fetch(`${sbUrl}/rest/v1/system_stats?select=*`, {
            headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
        });

        if (resp.ok) {
            const data = await resp.json();
            if (data && data.length > 0) {
                return res.json({
                    tokens: data[0].total_tokens,
                    chats: data[0].total_chats,
                    users: data[0].total_users
                });
            }
        }
        res.json({ visits: 0, chats: 0, tokens: 0 });
    } catch(e) {
        res.json({ visits: 0, chats: 0, tokens: 0 });
    }
});

app.post('/api/p2p/global_metrics', async (req, res) => {
    try {
        const { tokens = 0 } = req.body;
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!sbUrl || !sbKey || tokens <= 0) return res.json({ success: false });

        await fetch(`${sbUrl}/rest/v1/messages`, {
            method: 'POST',
            headers: { 
                "apikey": sbKey, 
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                node_id: 'GLOBAL_METRICS', 
                content: '[Network Pulse]', 
                role: 'assistant', 
                tokens 
            })
        });

        res.json({ success: true });
    } catch (e) {
        res.json({ success: false });
    }
});

// Subscription logic removed for anonymity


// Fallback
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.url} not found in CoitHub Mesh` });
});

export default app;

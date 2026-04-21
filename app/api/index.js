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
            stream: true,
            max_tokens: req.body.max_tokens,
            temperature: req.body.temperature
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
        
        const resp = await fetch(`${sbUrl}/rest/v1/active_nodes?peer_id=eq.GLOBAL_METRICS&select=metrics`, {
            headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
        });
        
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.length > 0 && data[0].metrics) {
                return res.json(data[0].metrics);
            }
        }
        res.json({ visits: 0, chats: 0, tokens: 0 });
    } catch(e) {
        console.error('[Metrics] GET Error:', e.message);
        res.json({ visits: 0, chats: 0, tokens: 0 });
    }
});

app.post('/api/p2p/global_metrics', async (req, res) => {
    try {
        const { visits = 0, chats = 0, tokens = 0 } = req.body;
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        if (!sbUrl || !sbKey) {
            if (chats > 0 || tokens > 0) console.warn("[Metrics] Persistence disabled: Missing Supabase credentials in .env");
            return res.json({ visits: 0, chats: 0, tokens: 0 });
        }
        
        // 1. Fetch current
        const fetchResp = await fetch(`${sbUrl}/rest/v1/active_nodes?peer_id=eq.GLOBAL_METRICS&select=metrics`, {
            headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
        });
        
        let current = { visits: 0, chats: 0, tokens: 0 };
        if (fetchResp.ok) {
            const data = await fetchResp.json();
            if (data && data.length > 0 && data[0].metrics) current = data[0].metrics;
        }

        // 2. Increment safely
        current.visits = (parseInt(current.visits) || 0) + (parseInt(visits) || 0);
        current.chats = (parseInt(current.chats) || 0) + (parseInt(chats) || 0);
        current.tokens = (parseInt(current.tokens) || 0) + (parseInt(tokens) || 0);

        // 3. Upsert back to Supabase
        const updateResp = await fetch(`${sbUrl}/rest/v1/active_nodes`, {
            method: 'POST',
            headers: { 
                "apikey": sbKey, 
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
                peer_id: 'GLOBAL_METRICS',
                addr: 'global.coithub.org',
                region: 'Global-Network',
                last_seen: new Date().toISOString(),
                metrics: current
            })
        });

        if (!updateResp.ok) {
            const err = await updateResp.text();
            console.error(`[Metrics] Supabase Sync Fail (${updateResp.status}):`, err);
        }

        res.json(current);
        console.log(`[Metrics] Synchronized: ${current.tokens} tokens, ${current.chats} chats.`);
    } catch(e) {
        console.error('[Metrics] POST Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
        
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

        if (!sbUrl || !sbKey) {
            console.error('[Subscribe] Missing Supabase Credentials');
            return res.json({ success: true, warning: 'local-mode' });
        }

        // Using active_nodes as a generic key-value store to avoid schema changes
        const subResp = await fetch(`${sbUrl}/rest/v1/active_nodes`, {
            method: 'POST',
            headers: { 
                "apikey": sbKey, 
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify({
                peer_id: `SUB_${email.replace(/[^a-zA-Z0-9]/g, '_')}`.toUpperCase().substring(0, 60),
                addr: email,
                region: 'CH-LEAD',
                models: ['subscriber-v1'],
                last_seen: new Date().toISOString(),
                metrics: { email, source: 'landing_landing_v1' }
            })
        });

        if (!subResp.ok) {
            const errLog = await subResp.text();
            console.error(`[Subscribe] Supabase Error: ${subResp.status} - ${errLog}`);
            throw new Error("Registry Unavailable");
        }

        console.log(`[Mesh] New Subscriber Registered: ${email}`);
        res.json({ success: true });
    } catch(e) {
        console.error('[Subscribe] Critical Failure:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Fallback
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.url} not found in CoitHub Mesh` });
});

export default app;

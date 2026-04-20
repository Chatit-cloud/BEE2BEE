import WebSocket from 'ws';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

export class DynamicBee2BeeBridge {
    constructor(seedNodes = []) {
        this.nodes = new Set(seedNodes);
        this.activeWs = null;
        this.activeUrl = null;
        this.pendingRequests = new Map();
        this.peerMetadata = new Map();
        this.stats = { uptime: Date.now(), totalPeers: 0, activeNode: null };
        
        // Start autonomous discovery
        this.connect();
        setInterval(() => this.syncGlobalMesh(), 30000);
    }

    async connect() {
        if (this.activeWs) return;

        // Try global discovery first
        await this.syncGlobalMesh();

        const nodeArray = Array.from(this.nodes);
        if (nodeArray.length === 0) {
            console.log('\x1b[33m%s\x1b[0m', '[Mesh] Neural Network Search Active... (No nodes yet)');
            return;
        }

        // Round-robin / Random selection
        this.activeUrl = nodeArray[Math.floor(Math.random() * nodeArray.length)];
        
        try {
            console.log(`[Mesh] Connecting to Swarm Node: ${this.activeUrl}`);
            this.activeWs = new WebSocket(this.activeUrl);
            this._setupHandlers();
        } catch (e) {
            console.error(`[Mesh] Node Unreachable: ${this.activeUrl}`);
            this.nodes.delete(this.activeUrl);
            this.activeWs = null;
            setTimeout(() => this.connect(), 2000);
        }
    }

    async syncGlobalMesh() {
        const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!sbUrl || !sbKey) return;

        try {
            const resp = await fetch(`${sbUrl}/rest/v1/active_nodes?select=*&order=last_seen.desc&limit=20`, {
                headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` }
            });
            if (resp.ok) {
                const nodes = await resp.json();
                nodes.forEach(node => {
                    if (node.addr) {
                        this.nodes.add(node.addr);
                        this._updatePeerMetadata(node.addr, {
                            peer_id: node.peer_id,
                            region: node.region,
                            models: node.models,
                            metrics: node.metrics,
                            backend: node.metrics?.backend
                        });
                    }
                });
            }
        } catch (e) {
            console.error('[Mesh] Registry Sync Error:', e.message);
        }
    }

    _setupHandlers() {
        if (!this.activeWs) return;

        this.activeWs.on('open', () => {
            console.log('\x1b[32m%s\x1b[0m', `[Mesh] Swarm Tunnel Established -> ${this.activeUrl}`);
            this.stats.activeNode = this.activeUrl;
        });

        this.activeWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                if (msg.type === 'peer_discovery' && msg.peers) {
                    msg.peers.forEach(p => {
                        this.nodes.add(p.addr);
                        this._updatePeerMetadata(p.addr, p);
                    });
                }

                if (msg.type === 'gen_response' && this.pendingRequests.has(msg.rid)) {
                    const { resolve } = this.pendingRequests.get(msg.rid);
                    this.pendingRequests.delete(msg.rid);
                    resolve({
                        text: msg.text,
                        rid: msg.rid,
                        metadata: { 
                            trust_score: msg.trust_score || 0.99,
                            latency: Date.now() - (this.pendingRequests.get(msg.rid)?.ts || Date.now()),
                            backend: msg.backend
                        }
                    });
                }

                if (msg.type === 'ping') {
                    this.activeWs.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                }
            } catch (e) { console.error('[Mesh] Protocol Error:', e); }
        });

        this.activeWs.on('close', () => {
            this.activeWs = null;
            this.activeUrl = null;
            this.stats.activeNode = null;
            setTimeout(() => this.connect(), 5000);
        });
    }

    _updatePeerMetadata(addr, msg) {
        if (!addr) return;
        const existing = this.peerMetadata.get(addr) || {};
        this.peerMetadata.set(addr, {
            ...existing,
            id: msg.peer_id || existing.id,
            addr: addr,
            region: msg.region || existing.region || 'Auto',
            metrics: msg.metrics || existing.metrics || {},
            models: msg.models || (msg.services ? Object.values(msg.services).flatMap(s => s.models || []) : []),
            backend: msg.backend || msg.metrics?.backend || existing.backend,
            status: 'active',
            last_seen: Date.now(),
            location: existing.location || [Math.random() * 120 - 60, Math.random() * 360 - 180]
        });
    }

    getRegionalMesh() {
        const mesh = {};
        this.peerMetadata.forEach((meta) => {
            const region = meta.region || 'Global';
            if (!mesh[region]) mesh[region] = [];
            mesh[region].push({ ...meta, latency: Math.floor(Math.random() * 50) + 10 });
        });
        return mesh;
    }

    async request(task) {
        // If we have an active persistent connection, use it (Fast/Low Latency)
        if (this.activeWs && this.activeWs.readyState === 1) {
            const rid = `req-${crypto.randomBytes(4).toString('hex')}`;
            return new Promise((resolve, reject) => {
                this.pendingRequests.set(rid, { resolve, reject, ts: Date.now() });
                setTimeout(() => {
                    if (this.pendingRequests.has(rid)) {
                        this.pendingRequests.delete(rid);
                        reject(new Error('Neural Consensus Timeout (120s)'));
                    }
                }, 120000);

                this.activeWs.send(JSON.stringify({
                    type: 'gen_request',
                    rid,
                    prompt: task.prompt,
                    model: task.model,
                    svc: 'ollama' // Default to ollama for now or infer from metadata
                }));
            });
        }

        // --- Serverless/Vercel Fallback: Direct HTTP Routing ---
        console.log('[Mesh] Operating in Stateless/Serverless Mode. Routing direct...');
        await this.syncGlobalMesh();
        
        const targetPeer = Array.from(this.peerMetadata.values()).find(p => 
            p.models && p.models.includes(task.model)
        );

        if (!targetPeer) throw new Error(`Deep Mesh Search: No nodes found for model ${task.model}`);

        // Infer FastAPI address (standard nodes use port 8000 for API)
        let apiUrl = targetPeer.addr.replace('ws://', 'http://').replace(':4001', ':8000');
        if (targetPeer.metrics?.api_url) apiUrl = targetPeer.metrics.api_url;

        console.log(`[Mesh] Forwarding to Neural Gateway: ${apiUrl}`);
        
        try {
            const resp = await fetch(`${apiUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: task.prompt,
                    model: task.model,
                    stream: false
                })
            });
            
            if (!resp.ok) throw new Error(`Node Gateway Error: ${resp.status}`);
            const data = await resp.json();
            
            return {
                text: data.response || data.text,
                rid: `srv-${crypto.randomBytes(2).toString('hex')}`,
                metadata: {
                    trust_score: 1.0,
                    backend: 'fastapi-direct',
                    node: targetPeer.addr
                }
            };
        } catch (e) {
            console.error(`[Mesh] Serverless Route Failed: ${e.message}`);
            throw new Error(`Consensus Failed: Node at ${targetPeer.addr} unreachable via HTTP.`);
        }
    }

    getStats() {
        return {
            ...this.stats,
            poolSize: this.peerMetadata.size,
            connected: !!this.activeWs,
            peers: Array.from(this.peerMetadata.values())
        };
    }

    registerJoinLink(link) {
        try {
            const url = new URL(link);
            const bootstrapEnc = url.searchParams.get('bootstrap') || url.searchParams.get('peer');
            if (!bootstrapEnc) throw new Error('Missing peer address');
            let bootstrapUrl = Buffer.from(bootstrapEnc, 'base64').toString();
            if (!bootstrapUrl.includes('://')) bootstrapUrl = `ws://${bootstrapUrl}`;
            this.nodes.add(bootstrapUrl);
            this.connect();
            return { success: true, node: bootstrapUrl };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

const seeds = process.env.BEE2BEE_SEEDS ? process.env.BEE2BEE_SEEDS.split(',') : ['ws://127.0.0.1:4001'];
export const bridge = new DynamicBee2BeeBridge(seeds);

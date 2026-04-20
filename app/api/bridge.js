import WebSocket from 'ws';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

export class DynamicCoitHubBridge {
    constructor(seedNodes = []) {
        this.nodes = new Set(seedNodes);
        this.activeWs = null;
        this.activeUrl = null;
        this.pendingRequests = new Map();
        this.peerMetadata = new Map();
        this.stats = { uptime: Date.now(), totalPeers: 0, activeNode: null };
        this.registeredNode = null; // Priority node from join link
        
        // Start autonomous discovery
        this.connect();
        setInterval(() => this.syncGlobalMesh(), 30000);
    }

    async connect() {
        if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) return;

        // Populate from registry first so we have metadata for nodes even before connecting
        await this.syncGlobalMesh();

        // Priority: Connect to registered node first
        let nodeArray = [];
        if (this.registeredNode) {
            nodeArray = [this.registeredNode, ...Array.from(this.nodes)];
        } else {
            nodeArray = Array.from(this.nodes);
        }

        if (nodeArray.length === 0) {
            console.log('\x1b[33m%s\x1b[0m', '[Mesh] Neural Network Search Active... (No nodes yet)');
            return;
        }

        // Remove duplicates
        nodeArray = [...new Set(nodeArray)];

        // Try each node until one connects
        for (const nodeUrl of nodeArray) {
            try {
                console.log(`[Mesh] Attempting connection to: ${nodeUrl}`);
                this.activeUrl = nodeUrl;
                this.activeWs = new WebSocket(nodeUrl);
                
                // Wait for open with timeout
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
                    this.activeWs.on('open', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    this.activeWs.on('error', (e) => {
                        clearTimeout(timeout);
                        reject(e);
                    });
                });
                
                this._setupHandlers();
                console.log(`[Mesh] ✅ Connected to: ${this.activeUrl}`);
                this.stats.activeNode = this.activeUrl;
                return;
            } catch (e) {
                console.error(`[Mesh] Failed to connect to ${nodeUrl}:`, e.message);
                this.nodes.delete(nodeUrl);
                if (this.registeredNode === nodeUrl) {
                    this.registeredNode = null; // Remove failed registered node
                }
                this.activeWs = null;
                this.activeUrl = null;
            }
        }

        // All nodes failed, retry after delay
        setTimeout(() => this.connect(), 5000);
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
        const rid = `req-${crypto.randomBytes(4).toString('hex')}`;

        // 1. Swarm-Backbone Primary (Persistent WebSocket)
        // If we have any connection, we use it. The Swarm Hub will now auto-forward.
        if (this.activeWs && this.activeWs.readyState === 1) {
            console.log(`[Mesh] Dispatching ${rid} to Neural Swarm Hub: ${this.activeUrl}`);
            return new Promise((resolve, reject) => {
                this.pendingRequests.set(rid, { resolve, reject, ts: Date.now() });
                
                // Allow up to 300s for heavy models (31B+)
                setTimeout(() => {
                    if (this.pendingRequests.has(rid)) {
                        this.pendingRequests.delete(rid);
                        reject(new Error('Neural Consensus Timeout (300s). The node is likely loading model or executing high-compute task.'));
                    }
                }, 300000);

                this.activeWs.send(JSON.stringify({
                    type: 'gen_request',
                    rid,
                    prompt: task.prompt,
                    model: task.model,
                    max_tokens: task.max_tokens,
                    temperature: task.temperature,
                    svc: task.svc || 'ollama'
                }));
            });
        }

        // 2. Serverless/Direct-HTTP Fallback
        console.log('[Mesh] Operating in Stateless Mode. Syncing Global Mesh...');
        await this.syncGlobalMesh();
        
        const targetPeer = Array.from(this.peerMetadata.values()).find(p => 
            p.models && p.models.includes(task.model)
        );

        if (!targetPeer) {
            // Even if we don't have metadata, try connecting to seeds if we were empty
            if (this.nodes.size > 0 && !this.activeWs) {
                 await this.connect();
                 if (this.activeWs) return this.request(task);
            }
            throw new Error(`Neural Search Failure: No nodes available for model "${task.model}"`);
        }

        // Default to port 8000 for FastAPI fallback
        let apiUrl = targetPeer.addr.replace('ws://', 'http://').replace(':4001', ':8000');
        if (targetPeer.metrics?.api_url) apiUrl = targetPeer.metrics.api_url;

        console.log(`[Mesh] Forwarding to Neural Peer: ${apiUrl}`);
        
        try {
            const resp = await fetch(`${apiUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: task.prompt,
                    model: task.model,
                    max_new_tokens: task.max_tokens || 2048,
                    temperature: task.temperature || 0.7,
                    stream: false
                })
            });
            
            if (!resp.ok) throw new Error(`Status ${resp.status}`);
            const data = await resp.json();
            
            return {
                text: data.response || data.text,
                rid,
                metadata: {
                    trust_score: 1.0,
                    backend: 'fastapi-direct',
                    node: targetPeer.addr
                }
            };
        } catch (e) {
            console.error(`[Mesh] Peer routing failed: ${e.message}`);
            // Final fallback: try to re-establish a hub connection if possible
            if (!this.activeWs) {
                await this.connect();
                if (this.activeWs) return this.request(task);
            }
            throw new Error(`Consensus Failed: Node at ${targetPeer.addr} unreachable. Error: ${e.message}`);
        }
    }

    async generate(prompt, model, options = {}) {
        const task = {
            prompt,
            model,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
            svc: options.svc
        };
        return this.request(task);
    }

    getStats() {
        return {
            ...this.stats,
            poolSize: this.peerMetadata.size,
            connected: !!this.activeWs,
            peers: Array.from(this.peerMetadata.values())
        };
    }

    async registerJoinLink(link) {
        try {
            const url = new URL(link);
            const bootstrapEnc = url.searchParams.get('bootstrap') || url.searchParams.get('peer');
            if (!bootstrapEnc) throw new Error('Missing peer address in link');
            // Handle URL-safe base64 (with or without padding)
            let padded = bootstrapEnc;
            const missing = 4 - (bootstrapEnc.length % 4);
            if (missing !== 4) {
                padded = bootstrapEnc + '='.repeat(missing);
            }
            let bootstrapUrl = Buffer.from(padded, 'base64').toString();
            if (!bootstrapUrl.includes('://')) bootstrapUrl = `ws://${bootstrapUrl}`;
            console.log(`[Bridge] Registering node: ${bootstrapUrl}`);
            
            // Set as priority node
            this.registeredNode = bootstrapUrl;
            this.nodes.add(bootstrapUrl);
            
            // Force reconnect to the registered node
            if (this.activeWs) {
                this.activeWs.close();
                this.activeWs = null;
            }
            
            await this.connect();
            return { success: true, node: bootstrapUrl, connected: !!this.activeWs };
        } catch (e) {
            console.error('[Bridge] Register failed:', e);
            return { success: false, error: e.message };
        }
    }
}

const seeds = process.env.BEE2BEE_SEEDS ? process.env.BEE2BEE_SEEDS.split(',') : ['ws://127.0.0.1:4001'];
export const bridge = new DynamicCoitHubBridge(seeds);

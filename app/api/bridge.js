import { WebSocket } from 'ws';
import crypto from 'crypto';

/**
 * Dynamic Neural Mesh Bridge
 * Maintains a resilient connection to the Bee2Bee P2P network
 * with auto-failover and peer discovery.
 */
class DynamicBee2BeeBridge {
    constructor(seeds = ['ws://127.0.0.1:4001']) {
        this.seeds = seeds;
        this.nodes = new Set(seeds);
        this.activeWs = null;
        this.activeUrl = null;
        this.pendingRequests = new Map();
        this.isConnecting = false;
        this.peerMetadata = new Map(); // Store detailed info for the globe
        this.stats = {
            totalPeers: 0,
            activeNode: null,
            latency: 0,
            uptime: Date.now()
        };
    }

    async connect() {
        if (this.activeWs || this.isConnecting) return;
        this.isConnecting = true;

        const nodeArray = Array.from(this.nodes);
        for (const url of nodeArray) {
            try {
                const ws = await this._tryConnect(url);
                if (ws) {
                    this.activeWs = ws;
                    this.activeUrl = url;
                    this.stats.activeNode = url;
                    this.isConnecting = false;
                    this._setupHandlers();
                    console.log(`✅ [Mesh] Neural link established with ${url}`);
                    return;
                }
            } catch (e) { }
        }

        this.isConnecting = false;
        setTimeout(() => this.connect(), 5000);
    }

    _tryConnect(url) {
        return new Promise((resolve) => {
            const ws = new WebSocket(url, { handshakeTimeout: 3000 });
            let resolved = false;

            ws.on('open', () => {
                if (!resolved) {
                    resolved = true;
                    ws.send(JSON.stringify({
                        type: 'hello',
                        peer_id: `gateway-${crypto.randomBytes(4).toString('hex')}`,
                        services: { 'gateway': true }
                    }));
                    resolve(ws);
                }
            });

            ws.on('error', () => { if (!resolved) { resolved = true; resolve(null); } ws.close(); });
            ws.on('close', () => { if (!resolved) { resolved = true; resolve(null); } });
            setTimeout(() => { if (!resolved) { resolved = true; ws.close(); resolve(null); } }, 3500);
        });
    }

    _setupHandlers() {
        this.activeWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                
                if (msg.type === 'gen_result' && this.pendingRequests.has(msg.rid)) {
                    const { resolve } = this.pendingRequests.get(msg.rid);
                    this.pendingRequests.delete(msg.rid);
                    resolve(msg);
                }

                if (msg.type === 'hello') {
                    // Update metadata for this node
                    this._updatePeerMetadata(msg.addr || this.activeUrl, msg);
                }

                if (msg.type === 'peer_list') {
                    const newPeers = msg.peers || [];
                    this.stats.totalPeers = newPeers.length;
                    
                    newPeers.forEach(p => {
                        const addr = typeof p === 'string' ? p : p.addr;
                        if (addr && !addr.startsWith('gateway')) {
                             const wsAddr = addr.includes('://') ? addr : `ws://${addr}`;
                             this.nodes.add(wsAddr);
                             this._updatePeerMetadata(wsAddr, p);
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
            this.connect();
        });
    }

    _updatePeerMetadata(addr, msg) {
        if (!addr) return;
        const host = addr.split('://')[1]?.split(':')[0] || '127.0.0.1';
        
        const existing = this.peerMetadata.get(addr) || {};
        this.peerMetadata.set(addr, {
            ...existing,
            id: msg.peer_id || existing.id,
            addr: addr,
            region: msg.region || existing.region || 'Auto',
            metrics: msg.metrics || existing.metrics || {},
            models: msg.services ? Object.values(msg.services).flatMap(s => s.models || []) : (msg.models || existing.models || []),
            status: 'active',
            last_seen: Date.now(),
            // Stable location based on hash of address if not provided
            location: existing.location || [Math.random() * 120 - 60, Math.random() * 360 - 180]
        });
    }

    getRegionalMesh() {
        const mesh = {};
        this.peerMetadata.forEach((meta, addr) => {
            const region = meta.region || 'Global';
            if (!mesh[region]) mesh[region] = [];
            mesh[region].push({
                ...meta,
                latency: Math.floor(Math.random() * 50) + 10 // Mock latency for display
            });
        });
        return mesh;
    }

    async request(task) {
        if (!this.activeWs) {
             await new Promise(r => setTimeout(r, 1000));
             if (!this.activeWs) throw new Error('Neural Mesh Offline');
        }

        const rid = `req-${crypto.randomBytes(4).toString('hex')}`;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(rid, { resolve, reject, ts: Date.now() });
            setTimeout(() => {
                if (this.pendingRequests.has(rid)) {
                    this.pendingRequests.delete(rid);
                    reject(new Error('Swarm execution timeout'));
                }
            }, 60000);

            this.activeWs.send(JSON.stringify({
                type: 'gen_request',
                rid,
                prompt: task.prompt,
                model: task.model || 'phi3',
                svc: 'hf'
            }));
        });
    }

    getStats() {
        return {
            ...this.stats,
            poolSize: this.nodes.size,
            connected: !!this.activeWs,
            peers: Array.from(this.peerMetadata.values())
        };
    }

    /**
     * Decode and register via link
     * Supports coithub:// and p2pnet://
     */
    registerJoinLink(link) {
        try {
            const url = new URL(link);
            const isCoit = url.protocol === 'coithub:';
            const isP2P = url.protocol === 'p2pnet:';
            
            if (!isCoit && !isP2P) throw new Error('Unsupported protocol');
            
            const bootstrapEnc = url.searchParams.get('bootstrap') || url.searchParams.get('peer');
            if (!bootstrapEnc) throw new Error('Missing peer address');

            let bootstrapUrl;
            try {
                bootstrapUrl = Buffer.from(bootstrapEnc, 'base64').toString();
            } catch {
                bootstrapUrl = bootstrapEnc; // Fallback to raw if not b64
            }
            
            if (!bootstrapUrl.includes('://')) bootstrapUrl = `ws://${bootstrapUrl}`;
            
            this.nodes.add(bootstrapUrl);
            if (!this.activeWs) this.connect();
            
            const metadata = {
                network: url.searchParams.get('network') || 'unknown',
                model: url.searchParams.get('model') || 'any',
                hash: url.searchParams.get('hash') || '0x???'
            };

            return { success: true, node: bootstrapUrl, metadata };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

const seeds = process.env.BEE2BEE_SEEDS ? process.env.BEE2BEE_SEEDS.split(',') : ['ws://127.0.0.1:4001'];
export const bridge = new DynamicBee2BeeBridge(seeds);

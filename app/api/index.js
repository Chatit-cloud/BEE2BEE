/**
 * Vercel Serverless API Gateway for Bee2Bee
 * This script provides the backend functionality when deployed to Vercel.
 * Note: In a serverless environment, this connects to an external P2P Node 
 * defined by the BEE2BEE_REMOTE_NODE environment variable.
 */

export default async function handler(req, res) {
  const { url, method, body } = req;
  const REMOTE_NODE = process.env.BEE2BEE_REMOTE_NODE || 'http://localhost:8000';

  // Extract the path after /api/
  const path = url.replace('/api/', '');

  try {
    // 1. Heartbeat
    if (path === 'v1/heartbeat') {
      return res.status(200).json({ status: 'healthy', environment: 'vercel-edge' });
    }

    // 2. Topology
    if (path === 'v1/network/topology') {
      const p2pRes = await fetch(`${REMOTE_NODE}/peers`);
      const peers = await p2pRes.json();
      return res.status(200).json({
        total_power: 0, // Simplified for serverless
        active_nodes: peers.length,
        mesh: peers.map(p => ({ ...p, role: 'Consensus-Validator', reputation: 0.9 }))
      });
    }

    // 3. Consensus/Compute
    if (path === 'v1/consensus/compute' && method === 'POST') {
      const p2pRes = await fetch(`${REMOTE_NODE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await p2pRes.json();
      return res.status(200).json(data);
    }

    res.status(404).json({ error: 'Endpoint not found in Bee2Bee Gateway' });
  } catch (error) {
    console.error('Gateway Error:', error);
    res.status(502).json({ error: 'Communication error with backend P2P node' });
  }
}

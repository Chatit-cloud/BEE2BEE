/**
 * Vercel Serverless API Gateway for Bee2Bee
 */
export default async function handler(req, res) {
  const { url, method, body } = req;
  // Support both local and remote nodes
  const REMOTE_NODE = process.env.BEE2BEE_REMOTE_NODE || 'http://localhost:4001';

  // Extract cleaned path
  const path = url.replace('/api/', '');

  try {
    // 1. Unified Consensus Path
    if (path.includes('p2p/consensus')) {
      if (method === 'OPTIONS') return res.status(204).end();
      if (method === 'POST') {
          const { task } = body;
          if (!task || !task.prompt) return res.status(400).json({ error: 'Missing prompt' });

          // If a remote node is configured, forward the request via HTTP
          // (Requires the P2P node to have an HTTP REST shim)
          if (process.env.BEE2BEE_REMOTE_NODE) {
              const resp = await fetch(`${REMOTE_NODE}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: task.prompt, model: task.model })
              });
              const data = await resp.json();
              return res.status(200).json({
                  text: data.text || data.result,
                  metadata: { trust_score: 0.99, neural_path: 'remote-p2p-node' }
              });
          }

          return res.status(200).json({
              text: `Gateway Active. No remote node configured at BEE2BEE_REMOTE_NODE. \n\nReceived: "${task.prompt}"`,
              metadata: { trust_score: 1.0, neural_path: 'vercel-edge-bridge' }
          });
      }
    }

    // 2. Status
    if (path.includes('p2p/status')) {
      return res.status(200).json({ status: 'online', mode: 'serverless' });
    }

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    res.status(502).json({ error: 'Gateway Communication Error' });
  }
}

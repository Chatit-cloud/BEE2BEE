/**
 * Bee2Bee Neural Consensus Client
 * High-level Javascript interface for the decentralized P2P network.
 */

class Bee2BeeAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if the gateway is alive
   */
  async checkHeartbeat() {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/heartbeat`);
      return await res.json();
    } catch (e) {
      console.error('Heartbeat failed:', e);
      return { status: 'offline' };
    }
  }

  /**
   * Get the current network topology and mesh health
   */
  async getTopology() {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/network/topology`);
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (e) {
      console.error('Topology fetch failed:', e);
      throw e;
    }
  }

  /**
   * Execute a neural consensus task (inference)
   * @param {string} prompt - The input question/task
   * @param {Object} options - { model, provider_id }
   */
  async executeConsensus(prompt, options = {}) {
    const { model = 'phi3', provider_id = null } = options;
    
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/consensus/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, provider_id })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Consensus Compute Error');
      }
      
      return await res.json();
    } catch (e) {
      console.error('Neural Task Failed:', e);
      throw e;
    }
  }

  /**
   * Complicated Logic: Select best provider based on topology metrics
   * @param {string} modelName 
   */
  async findOptimalNode(modelName) {
    const topology = await this.getTopology();
    const nodes = topology.mesh;
    
    // Logic: Lowest latency + highest reputation + has model
    const candidates = nodes.filter(n => n.models && n.models.includes(modelName));
    
    if (candidates.length === 0) return null;
    
    return candidates.sort((a, b) => {
      const scoreA = (a.reputation || 0) - (a.latency_ms / 1000);
      const scoreB = (b.reputation || 0) - (b.latency_ms / 1000);
      return scoreB - scoreA; // Descending
    })[0];
  }
}

export const b2b = new Bee2BeeAPI();
export default b2b;

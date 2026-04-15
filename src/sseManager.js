'use strict';

/**
 * Simple SSE (Server-Sent Events) manager.
 * Tracks active SSE clients per endpoint ID.
 */
class SseManager {
  constructor() {
    /** @type {Map<string, Set<import('express').Response>>} */
    this.clients = new Map();
  }

  /**
   * Subscribe a response object to SSE stream for an endpoint
   * @param {string} endpointId
   * @param {import('express').Response} res
   */
  subscribe(endpointId, res) {
    if (!this.clients.has(endpointId)) {
      this.clients.set(endpointId, new Set());
    }
    this.clients.get(endpointId).add(res);
  }

  /**
   * Unsubscribe a response from an endpoint's SSE stream
   * @param {string} endpointId
   * @param {import('express').Response} res
   */
  unsubscribe(endpointId, res) {
    const set = this.clients.get(endpointId);
    if (set) {
      set.delete(res);
      if (set.size === 0) this.clients.delete(endpointId);
    }
  }

  /**
   * Broadcast a JSON payload to all SSE clients subscribed to an endpoint
   * @param {string} endpointId
   * @param {object} data
   */
  broadcast(endpointId, data) {
    const set = this.clients.get(endpointId);
    if (!set || set.size === 0) return 0;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    let count = 0;
    for (const res of set) {
      try {
        res.write(payload);
        count++;
      } catch (err) {
        // Client disconnected — clean up
        set.delete(res);
      }
    }
    return count;
  }

  /**
   * Count active listeners for an endpoint
   * @param {string} endpointId
   * @returns {number}
   */
  listenerCount(endpointId) {
    return this.clients.get(endpointId)?.size || 0;
  }

  /**
   * Total active SSE connections across all endpoints
   */
  get totalConnections() {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }
}

module.exports = new SseManager();

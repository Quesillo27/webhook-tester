'use strict';

const express = require('express');
const path = require('path');
const { nanoid } = require('nanoid');
const db = require('./db');
const sse = require('./sseManager');

const app = express();
const PORT = process.env.PORT || 4000;
const MAX_BODY_SIZE = '1mb';
const MAX_REQUESTS_PER_ENDPOINT = 200;

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));
app.use(express.text({ limit: MAX_BODY_SIZE }));
app.use(express.raw({ limit: MAX_BODY_SIZE }));
app.set('trust proxy', 1);

// Serve frontend SPA
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    activeConnections: sse.totalConnections,
  });
});

// ── Endpoint management ──────────────────────────────────────────────────────

/** POST /api/endpoints — Create a new webhook endpoint */
app.post('/api/endpoints', (req, res) => {
  const id = nanoid(10);
  const label = req.body?.label || `Endpoint ${id}`;
  const endpoint = db.createEndpoint(id, label);
  res.status(201).json({ endpoint, url: `/hooks/${id}` });
});

/** GET /api/endpoints — List all endpoints */
app.get('/api/endpoints', (req, res) => {
  res.json({ endpoints: db.listEndpoints() });
});

/** GET /api/endpoints/:id — Get single endpoint info */
app.get('/api/endpoints/:id', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });
  res.json({ endpoint });
});

/** DELETE /api/endpoints/:id — Delete endpoint and all its requests */
app.delete('/api/endpoints/:id', (req, res) => {
  const deleted = db.deleteEndpoint(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Endpoint not found' });
  res.json({ message: 'Endpoint deleted' });
});

// ── Request management ───────────────────────────────────────────────────────

/** GET /api/endpoints/:id/requests — List received requests */
app.get('/api/endpoints/:id/requests', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });

  const limit = Math.min(parseInt(req.query.limit) || 50, MAX_REQUESTS_PER_ENDPOINT);
  const requests = db.listRequests(req.params.id, limit);
  res.json({ requests, total: endpoint.request_count });
});

/** DELETE /api/endpoints/:id/requests — Clear all requests for endpoint */
app.delete('/api/endpoints/:id/requests', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });
  const deleted = db.deleteRequests(req.params.id);
  res.json({ message: `${deleted} requests deleted` });
});

// ── SSE stream ───────────────────────────────────────────────────────────────

/** GET /api/endpoints/:id/stream — SSE stream for real-time updates */
app.get('/api/endpoints/:id/stream', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) return res.status(404).json({ error: 'Endpoint not found' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
  res.flushHeaders();

  // Send initial "connected" event
  res.write(`data: ${JSON.stringify({ type: 'connected', endpointId: req.params.id })}\n\n`);

  // Register client
  sse.subscribe(req.params.id, res);

  // Heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.unsubscribe(req.params.id, res);
  });
});

// ── Webhook receiver ─────────────────────────────────────────────────────────

/**
 * ALL /hooks/:id/* — catch webhooks on any HTTP method
 * Stores request details and broadcasts to SSE clients
 */
app.all('/hooks/:id*', (req, res) => {
  const endpointId = req.params.id;
  const endpoint = db.getEndpoint(endpointId);

  if (!endpoint) {
    return res.status(404).json({
      error: 'Webhook endpoint not found',
      hint: 'Create an endpoint first at POST /api/endpoints',
    });
  }

  // Serialize body
  let body = null;
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    body = JSON.stringify(req.body);
  } else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    body = req.body.toString('utf8');
  } else if (req.body && typeof req.body === 'object') {
    body = JSON.stringify(req.body);
  }

  // Filter sensitive headers from storage
  const headers = { ...req.headers };
  delete headers.cookie;
  delete headers.authorization;

  const reqData = {
    method: req.method,
    path: req.path,
    headers,
    query: req.query,
    body,
    contentType: ct,
  };

  const saved = db.saveRequest(endpointId, reqData);

  // Broadcast to SSE listeners
  sse.broadcast(endpointId, {
    type: 'request',
    request: saved,
  });

  // Return 200 OK (standard webhook acknowledgement)
  res.status(200).json({
    received: true,
    requestId: saved.id,
    endpointId,
    timestamp: saved.received_at,
  });
});

// ── 404 fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`webhook-tester running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to start testing webhooks`);
  });
}

module.exports = app;

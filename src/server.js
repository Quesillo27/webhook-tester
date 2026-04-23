'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { nanoid } = require('nanoid');
const config = require('./config');
const logger = require('./logger');
const metrics = require('./metrics');
const db = require('./db');
const { sendError, sendSuccess } = require('./responses');
const sse = require('./sseManager');
const { validateEndpointLabel, validateRequestFilters } = require('./validators');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json({ limit: config.maxBodySize }));
app.use(express.urlencoded({ extended: true, limit: config.maxBodySize }));
app.use(express.text({ limit: config.maxBodySize }));
app.use(express.raw({ limit: config.maxBodySize }));
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    metrics.record(res.statusCode, latencyMs);
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs: Number(latencyMs.toFixed(2)),
    }, 'request completed');
  });
  next();
});

// Serve frontend SPA
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, {
      status: 400,
      error: 'invalid_json',
      message: 'Request body contains invalid JSON',
    });
  }
  return next(err);
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  const metricSnapshot = metrics.snapshot();
  const dbStats = db.getStats();
  return res.json({
    status: 'ok',
    version: config.appVersion,
    activeConnections: sse.totalConnections,
    uptimeMs: metricSnapshot.uptimeMs,
    db: 'connected',
    stats: dbStats,
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (req, res) => {
  const metricSnapshot = metrics.snapshot();
  const dbStats = db.getStats();
  return sendSuccess(res, {
    data: {
      metrics: {
        ...metricSnapshot,
        activeConnections: sse.totalConnections,
        ...dbStats,
      },
    },
  });
});

// ── Endpoint management ──────────────────────────────────────────────────────

/** POST /api/endpoints — Create a new webhook endpoint */
app.post('/api/endpoints', (req, res) => {
  const validatedLabel = validateEndpointLabel(req.body?.label);
  if (validatedLabel.error) {
    return sendError(res, {
      status: 422,
      error: 'invalid_label',
      message: validatedLabel.error,
    });
  }

  const id = nanoid(10);
  const label = validatedLabel.value || `Endpoint ${id}`;
  const endpoint = db.createEndpoint(id, label);
  return sendSuccess(res, {
    status: 201,
    message: 'Endpoint created',
    data: {
      endpoint,
      url: `/hooks/${id}`,
    },
  });
});

/** GET /api/endpoints — List all endpoints */
app.get('/api/endpoints', (req, res) => {
  return sendSuccess(res, {
    data: {
      endpoints: db.listEndpoints(),
    },
  });
});

/** GET /api/endpoints/:id — Get single endpoint info */
app.get('/api/endpoints/:id', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }
  return sendSuccess(res, {
    data: {
      endpoint,
    },
  });
});

/** DELETE /api/endpoints/:id — Delete endpoint and all its requests */
app.delete('/api/endpoints/:id', (req, res) => {
  const deleted = db.deleteEndpoint(req.params.id);
  if (!deleted) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }
  return sendSuccess(res, {
    message: 'Endpoint deleted',
  });
});

// ── Request management ───────────────────────────────────────────────────────

/** GET /api/endpoints/:id/requests — List received requests */
app.get('/api/endpoints/:id/requests', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }

  const filters = validateRequestFilters(req.query);
  if (filters.error) {
    return sendError(res, { status: 422, error: 'invalid_filters', message: filters.error });
  }

  const requests = db.listRequests(req.params.id, filters.value);
  const filteredTotal = db.countRequests(req.params.id, filters.value);
  return sendSuccess(res, {
    data: {
      requests,
      total: endpoint.request_count,
      filteredTotal,
      pagination: {
        limit: filters.value.limit,
        offset: filters.value.offset,
        hasMore: filters.value.offset + requests.length < filteredTotal,
      },
      filters: {
        method: filters.value.method || null,
        search: filters.value.search || null,
      },
    },
  });
});

app.get('/api/endpoints/:id/requests/:requestId', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }

  const requestId = Number.parseInt(req.params.requestId, 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return sendError(res, { status: 422, error: 'invalid_request_id', message: 'Request id must be a positive integer' });
  }

  const savedRequest = db.getRequestForEndpoint(req.params.id, requestId);
  if (!savedRequest) {
    return sendError(res, { status: 404, error: 'request_not_found', message: 'Request not found for this endpoint' });
  }

  return sendSuccess(res, {
    data: {
      request: savedRequest,
    },
  });
});

/** DELETE /api/endpoints/:id/requests — Clear all requests for endpoint */
app.delete('/api/endpoints/:id/requests', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }
  const deleted = db.deleteRequests(req.params.id);
  return sendSuccess(res, {
    message: `${deleted} requests deleted`,
    data: {
      deleted,
    },
  });
});

// ── SSE stream ───────────────────────────────────────────────────────────────

/** GET /api/endpoints/:id/stream — SSE stream for real-time updates */
app.get('/api/endpoints/:id/stream', (req, res) => {
  const endpoint = db.getEndpoint(req.params.id);
  if (!endpoint) {
    return sendError(res, { status: 404, error: 'endpoint_not_found', message: 'Endpoint not found' });
  }

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
      success: false,
      error: 'Webhook endpoint not found',
      message: 'Webhook endpoint not found',
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
    success: true,
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
    sendError(res, { status: 404, error: 'not_found', message: 'Not found' });
  }
});

app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  return sendError(res, { status: 500, error: 'internal_error', message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'webhook-tester server started');
  });
}

module.exports = app;

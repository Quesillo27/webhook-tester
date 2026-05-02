'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use isolated in-memory DB for tests
process.env.DB_PATH = path.join('/tmp', `wh-test-${Date.now()}.db`);

const app = require('../src/server');
const db = require('../src/db');

afterAll(() => {
  db.closeDb();
  try { fs.unlinkSync(process.env.DB_PATH); } catch {}
});

// ── Health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.activeConnections).toBe('number');
    expect(typeof res.body.uptimeMs).toBe('number');
  });

  test('GET /metrics returns runtime counters', async () => {
    await request(app).get('/health');

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.metrics).toBeDefined();
    expect(typeof res.body.metrics.requests).toBe('number');
    expect(typeof res.body.metrics.avgLatencyMs).toBe('number');
  });
});

// ── Endpoint CRUD ─────────────────────────────────────────────────────────────

describe('Endpoint management', () => {
  let endpointId;

  test('POST /api/endpoints creates an endpoint', async () => {
    const res = await request(app)
      .post('/api/endpoints')
      .send({ label: 'Test Endpoint' });
    expect(res.status).toBe(201);
    expect(res.body.endpoint).toBeDefined();
    expect(res.body.url).toMatch(/^\/hooks\//);
    endpointId = res.body.endpoint.id;
  });

  test('POST /api/endpoints rejects blank labels', async () => {
    const res = await request(app)
      .post('/api/endpoints')
      .send({ label: '   ' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('invalid_label');
  });

  test('GET /api/endpoints lists endpoints', async () => {
    const res = await request(app).get('/api/endpoints');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body.endpoints.some(e => e.id === endpointId)).toBe(true);
  });

  test('GET /api/endpoints/:id returns single endpoint', async () => {
    const res = await request(app).get(`/api/endpoints/${endpointId}`);
    expect(res.status).toBe(200);
    expect(res.body.endpoint.id).toBe(endpointId);
    expect(res.body.endpoint.label).toBe('Test Endpoint');
  });

  test('GET /api/endpoints/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/endpoints/doesnotexist');
    expect(res.status).toBe(404);
  });

  test('DELETE /api/endpoints/:id deletes endpoint', async () => {
    // Create fresh one to delete
    const create = await request(app)
      .post('/api/endpoints')
      .send({ label: 'To Delete' });
    const id = create.body.endpoint.id;

    const del = await request(app).delete(`/api/endpoints/${id}`);
    expect(del.status).toBe(200);

    const get = await request(app).get(`/api/endpoints/${id}`);
    expect(get.status).toBe(404);
  });
});

// ── Webhook receiver ──────────────────────────────────────────────────────────

describe('Webhook receiving', () => {
  let endpointId;

  beforeAll(async () => {
    const res = await request(app).post('/api/endpoints').send({ label: 'Hooks Test' });
    endpointId = res.body.endpoint.id;
  });

  test('POST /hooks/:id accepts JSON webhook', async () => {
    const res = await request(app)
      .post(`/hooks/${endpointId}`)
      .send({ event: 'user.created', userId: 42 });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.endpointId).toBe(endpointId);
  });

  test('POST /hooks/:id rejects malformed JSON bodies', async () => {
    const res = await request(app)
      .post(`/hooks/${endpointId}`)
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_json');
  });

  test('POST /hooks/:id rejects bodies larger than MAX_BODY_SIZE', async () => {
    const res = await request(app)
      .post(`/hooks/${endpointId}`)
      .send({ payload: 'x'.repeat((1024 * 1024) + 64) });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('payload_too_large');
  });

  test('GET /hooks/:id is also recorded', async () => {
    const res = await request(app)
      .get(`/hooks/${endpointId}?foo=bar`);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('PUT /hooks/:id is recorded', async () => {
    const res = await request(app)
      .put(`/hooks/${endpointId}`)
      .send({ update: true });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('DELETE /hooks/:id is recorded', async () => {
    const res = await request(app)
      .delete(`/hooks/${endpointId}`);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('POST /hooks/nonexistent returns 404', async () => {
    const res = await request(app)
      .post('/hooks/doesnotexist')
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ── Request list & management ─────────────────────────────────────────────────

describe('Request list', () => {
  let endpointId;

  beforeAll(async () => {
    const res = await request(app).post('/api/endpoints').send({ label: 'Requests Test' });
    endpointId = res.body.endpoint.id;
    // Send 3 webhooks
    await request(app).post(`/hooks/${endpointId}`).send({ n: 1 });
    await request(app).post(`/hooks/${endpointId}`).send({ n: 2 });
    await request(app).post(`/hooks/${endpointId}`).send({ n: 3 });
  });

  test('GET /api/endpoints/:id/requests returns list', async () => {
    const res = await request(app).get(`/api/endpoints/${endpointId}/requests`);
    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(3);
    expect(res.body.total).toBe(3);
    expect(res.body.filteredTotal).toBe(3);
  });

  test('requests include method, path, headers, body', async () => {
    const res = await request(app).get(`/api/endpoints/${endpointId}/requests`);
    const r = res.body.requests[0];
    expect(r.method).toBe('POST');
    expect(typeof r.headers).toBe('object');
    expect(r.body).toBeTruthy();
  });

  test('DELETE /api/endpoints/:id/requests clears all', async () => {
    const del = await request(app).delete(`/api/endpoints/${endpointId}/requests`);
    expect(del.status).toBe(200);
    expect(del.body.message).toMatch(/deleted/);

    const list = await request(app).get(`/api/endpoints/${endpointId}/requests`);
    expect(list.body.requests.length).toBe(0);
    expect(list.body.total).toBe(0);
  });

  test('GET /api/endpoints/:id/requests supports method and search filters', async () => {
    const create = await request(app).post('/api/endpoints').send({ label: 'Filter test' });
    const filteredEndpointId = create.body.endpoint.id;

    await request(app).post(`/hooks/${filteredEndpointId}/orders`).send({ event: 'order.created' });
    await request(app).post(`/hooks/${filteredEndpointId}/users`).send({ event: 'user.created' });
    await request(app).get(`/hooks/${filteredEndpointId}/orders?status=ok`);

    const res = await request(app).get(`/api/endpoints/${filteredEndpointId}/requests?method=POST&search=order`);
    expect(res.status).toBe(200);
    expect(res.body.filteredTotal).toBe(1);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].path).toContain('/orders');
  });

  test('GET /api/endpoints/:id/requests supports pagination', async () => {
    const create = await request(app).post('/api/endpoints').send({ label: 'Pagination test' });
    const paginationEndpointId = create.body.endpoint.id;

    for (let index = 0; index < 3; index += 1) {
      await request(app).post(`/hooks/${paginationEndpointId}`).send({ index });
    }

    const pageOne = await request(app).get(`/api/endpoints/${paginationEndpointId}/requests?limit=2&offset=0`);
    const pageTwo = await request(app).get(`/api/endpoints/${paginationEndpointId}/requests?limit=2&offset=2`);

    expect(pageOne.status).toBe(200);
    expect(pageOne.body.requests).toHaveLength(2);
    expect(pageOne.body.pagination.hasMore).toBe(true);
    expect(pageTwo.body.requests).toHaveLength(1);
    expect(pageTwo.body.pagination.hasMore).toBe(false);
  });

  test('GET /api/endpoints/:id/requests/:requestId returns a single saved request', async () => {
    const create = await request(app).post('/api/endpoints').send({ label: 'Detail test' });
    const detailEndpointId = create.body.endpoint.id;

    const hookResponse = await request(app)
      .post(`/hooks/${detailEndpointId}/detail`)
      .send({ hello: 'world' });

    const res = await request(app).get(`/api/endpoints/${detailEndpointId}/requests/${hookResponse.body.requestId}`);
    expect(res.status).toBe(200);
    expect(res.body.request.id).toBe(hookResponse.body.requestId);
    expect(res.body.request.path).toContain('/detail');
  });

  test('GET /api/endpoints/:id/requests rejects invalid filters', async () => {
    const create = await request(app).post('/api/endpoints').send({ label: 'Invalid filters' });
    const invalidEndpointId = create.body.endpoint.id;

    const res = await request(app).get(`/api/endpoints/${invalidEndpointId}/requests?limit=-1`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_filters');
  });
});

// ── Static / SPA fallback ─────────────────────────────────────────────────────

describe('Frontend', () => {
  test('GET / serves index.html', async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
  });
});

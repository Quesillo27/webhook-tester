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
    expect(typeof res.body.activeConnections).toBe('number');
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
});

// ── Static / SPA fallback ─────────────────────────────────────────────────────

describe('Frontend', () => {
  test('GET / serves index.html', async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
  });
});

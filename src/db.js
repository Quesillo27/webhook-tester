'use strict';

const Database = require('better-sqlite3');
const config = require('./config');

let db;

function getDb() {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      label TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      request_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      headers TEXT NOT NULL,
      query TEXT NOT NULL,
      body TEXT,
      content_type TEXT,
      received_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_requests_endpoint ON requests(endpoint_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_endpoint_method ON requests(endpoint_id, method, received_at DESC);
  `);
}

// ── Endpoint operations ──────────────────────────────────────────────────────

function createEndpoint(id, label) {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO endpoints (id, label) VALUES (?, ?)'
  );
  stmt.run(id, label || null);
  return getEndpoint(id);
}

function getEndpoint(id) {
  const database = getDb();
  return database.prepare('SELECT * FROM endpoints WHERE id = ?').get(id);
}

function listEndpoints() {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM endpoints ORDER BY created_at DESC LIMIT 100'
  ).all();
}

function deleteEndpoint(id) {
  const database = getDb();
  const result = database.prepare('DELETE FROM endpoints WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Request operations ───────────────────────────────────────────────────────

function saveRequest(endpointId, reqData) {
  const database = getDb();
  const insert = database.prepare(`
    INSERT INTO requests (endpoint_id, method, path, headers, query, body, content_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const update = database.prepare(
    'UPDATE endpoints SET request_count = request_count + 1 WHERE id = ?'
  );

  const result = database.transaction(() => {
    const r = insert.run(
      endpointId,
      reqData.method,
      reqData.path,
      JSON.stringify(reqData.headers),
      JSON.stringify(reqData.query),
      reqData.body || null,
      reqData.contentType || null
    );
    update.run(endpointId);
    return r.lastInsertRowid;
  })();

  return getRequest(result);
}

function getRequest(id) {
  const database = getDb();
  const row = database.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  if (!row) return null;
  return parseRequest(row);
}

function buildRequestWhere(endpointId, filters = {}) {
  const clauses = ['endpoint_id = ?'];
  const params = [endpointId];

  if (filters.method) {
    clauses.push('method = ?');
    params.push(filters.method);
  }

  if (filters.search) {
    const like = `%${filters.search}%`;
    clauses.push("(path LIKE ? OR COALESCE(body, '') LIKE ?)");
    params.push(like, like);
  }

  return {
    where: clauses.join(' AND '),
    params,
  };
}

function listRequests(endpointId, filters = {}) {
  const database = getDb();
  const { where, params } = buildRequestWhere(endpointId, filters);
  const rows = database.prepare(
    `SELECT * FROM requests WHERE ${where} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, filters.limit, filters.offset);
  return rows.map(parseRequest);
}

function countRequests(endpointId, filters = {}) {
  const database = getDb();
  const { where, params } = buildRequestWhere(endpointId, filters);
  const result = database.prepare(`SELECT COUNT(*) AS count FROM requests WHERE ${where}`).get(...params);
  return result.count;
}

function getRequestForEndpoint(endpointId, requestId) {
  const database = getDb();
  const row = database.prepare(
    'SELECT * FROM requests WHERE endpoint_id = ? AND id = ?'
  ).get(endpointId, requestId);
  return row ? parseRequest(row) : null;
}

function deleteRequests(endpointId) {
  const database = getDb();
  const result = database.prepare('DELETE FROM requests WHERE endpoint_id = ?').run(endpointId);
  database.prepare('UPDATE endpoints SET request_count = 0 WHERE id = ?').run(endpointId);
  return result.changes;
}

function parseRequest(row) {
  return {
    ...row,
    headers: JSON.parse(row.headers),
    query: JSON.parse(row.query),
  };
}

function getStats() {
  const database = getDb();
  const endpoints = database.prepare('SELECT COUNT(*) AS count FROM endpoints').get().count;
  const requests = database.prepare('SELECT COUNT(*) AS count FROM requests').get().count;
  return {
    endpoints,
    requests,
  };
}

// Close DB (for tests)
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  createEndpoint, getEndpoint, listEndpoints, deleteEndpoint,
  saveRequest, getRequest, getRequestForEndpoint, listRequests, countRequests, deleteRequests,
  getStats,
  closeDb,
};

'use strict';

const startedAt = Date.now();

const state = {
  requests: 0,
  errors: 0,
  totalLatencyMs: 0,
};

function record(statusCode, latencyMs) {
  state.requests += 1;
  state.totalLatencyMs += latencyMs;
  if (statusCode >= 400) {
    state.errors += 1;
  }
}

function snapshot() {
  return {
    requests: state.requests,
    errors: state.errors,
    avgLatencyMs: state.requests ? Number((state.totalLatencyMs / state.requests).toFixed(2)) : 0,
    uptimeMs: Date.now() - startedAt,
    startedAt,
  };
}

module.exports = {
  record,
  snapshot,
};

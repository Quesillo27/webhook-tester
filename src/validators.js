'use strict';

const config = require('./config');

function validateEndpointLabel(rawLabel) {
  if (rawLabel == null || rawLabel === '') {
    return { value: null };
  }

  if (typeof rawLabel !== 'string') {
    return { error: 'label must be a string' };
  }

  const label = rawLabel.trim();
  if (!label) {
    return { error: 'label cannot be empty' };
  }

  if (label.length > config.maxEndpointLabelLength) {
    return { error: `label cannot exceed ${config.maxEndpointLabelLength} characters` };
  }

  return { value: label };
}

function parsePositiveInteger(value, fallback, max) {
  if (value == null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.min(parsed, max);
}

function validateRequestFilters(query) {
  const limit = parsePositiveInteger(query.limit, config.defaultRequestPageSize, config.maxRequestPageSize);
  const offset = parsePositiveInteger(query.offset, 0, Number.MAX_SAFE_INTEGER);

  if (limit == null || offset == null) {
    return { error: 'limit and offset must be positive integers' };
  }

  let method;
  if (query.method) {
    method = String(query.method).trim().toUpperCase();
    if (!/^[A-Z]+$/.test(method)) {
      return { error: 'method filter must be a valid HTTP method token' };
    }
  }

  let search;
  if (query.search) {
    search = String(query.search).trim();
    if (search.length > config.maxSearchLength) {
      return { error: `search cannot exceed ${config.maxSearchLength} characters` };
    }
  }

  return {
    value: {
      limit,
      offset,
      method,
      search,
    },
  };
}

module.exports = {
  validateEndpointLabel,
  validateRequestFilters,
};

'use strict';

const path = require('path');

module.exports = {
  appVersion: '1.1.1',
  port: Number(process.env.PORT || 4000),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'webhooks.db'),
  maxBodySize: process.env.MAX_BODY_SIZE || '1mb',
  defaultRequestPageSize: Number(process.env.DEFAULT_REQUEST_PAGE_SIZE || 50),
  maxRequestPageSize: Number(process.env.MAX_REQUEST_PAGE_SIZE || 200),
  maxEndpointLabelLength: Number(process.env.MAX_ENDPOINT_LABEL_LENGTH || 80),
  maxSearchLength: Number(process.env.MAX_SEARCH_LENGTH || 120),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300),
};

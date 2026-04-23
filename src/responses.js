'use strict';

function sendSuccess(res, { status = 200, message, data = {} } = {}) {
  const payload = { success: true, data };
  if (message) {
    payload.message = message;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    Object.assign(payload, data);
  }
  return res.status(status).json(payload);
}

function sendError(res, { status = 500, error = 'internal_error', message = 'Internal server error' } = {}) {
  return res.status(status).json({
    success: false,
    error,
    message,
  });
}

module.exports = {
  sendSuccess,
  sendError,
};

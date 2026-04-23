# Architecture

## Overview

`webhook-tester` is a lightweight Express service with a static frontend. The browser manages endpoints and streams incoming webhooks in real time through Server-Sent Events.

## Main components

- `src/server.js`: HTTP routes, middleware and request lifecycle.
- `src/db.js`: SQLite access layer for endpoints and captured requests.
- `src/sseManager.js`: in-memory registry of active SSE clients.
- `src/config.js`: central application configuration and limits.
- `src/logger.js` and `src/metrics.js`: observability primitives.
- `public/index.html`: single-file UI for endpoint management and inspection.

## Design decisions

- SQLite keeps the project self-hosted and simple to run without external services.
- SSE was chosen over WebSockets because traffic is server-to-browser only and browser support is native.
- Request history filters run at the SQL layer to avoid loading all payloads into memory.
- API responses keep original top-level fields to avoid breaking existing consumers while introducing a standard response envelope.

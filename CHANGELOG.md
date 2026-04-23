# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-04-23

### Added
- Request filtering, pagination and single-request detail endpoint.
- `/metrics` endpoint with request counters, latency and active SSE connections.
- Structured logging with `pino`, security headers with `helmet`, and rate limiting.
- `.env.example`, `Makefile`, `setup.sh`, `LICENSE` and multi-stage Docker build.

### Changed
- API responses now include `success`, `message` and `data` without removing previous top-level fields.
- Frontend escapes user-controlled values and adds request filters for safer inspection.

### Fixed
- XSS risk in endpoint labels, request paths and key/value rendering in the browser.
- Invalid JSON bodies now return a consistent `400` response.

# webhook-tester

![CI](https://github.com/Quesillo27/webhook-tester/actions/workflows/ci.yml/badge.svg) ![Node.js](https://img.shields.io/badge/node-20-green) ![Express](https://img.shields.io/badge/express-4.x-blue) ![SQLite](https://img.shields.io/badge/sqlite-embedded-orange) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

Inspector de webhooks self-hosted con UI en tiempo real. Permite crear endpoints efimeros, capturar cualquier metodo HTTP, inspeccionar payloads desde el navegador y filtrar el historial sin depender de servicios externos.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/webhook-tester
cd webhook-tester
./setup.sh
```

## Uso rapido

```bash
npm start
```

Abre `http://localhost:4000`, crea un endpoint y usa la URL generada para enviar requests de prueba.

## Ejemplos reales

```bash
# 1. Crear endpoint
curl -X POST http://localhost:4000/api/endpoints \
  -H "Content-Type: application/json" \
  -d '{"label":"Stripe Sandbox"}'

# 2. Enviar webhook JSON
curl -X POST http://localhost:4000/hooks/abc123XYZ0/orders \
  -H "Content-Type: application/json" \
  -d '{"event":"order.created","amount":1499}'

# 3. Buscar solo POST que contengan "order"
curl "http://localhost:4000/api/endpoints/abc123XYZ0/requests?method=POST&search=order&limit=20"

# 4. Ver metricas del proceso
curl http://localhost:4000/metrics
```

## API

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio, uptime, DB y conexiones activas |
| GET | `/metrics` | Conteo total de requests, errores y latencia promedio |
| POST | `/api/endpoints` | Crear un endpoint webhook |
| GET | `/api/endpoints` | Listar endpoints creados |
| GET | `/api/endpoints/:id` | Obtener un endpoint |
| DELETE | `/api/endpoints/:id` | Eliminar endpoint y requests asociados |
| GET | `/api/endpoints/:id/requests` | Listar requests con `limit`, `offset`, `method`, `search` |
| GET | `/api/endpoints/:id/requests/:requestId` | Obtener un request puntual |
| DELETE | `/api/endpoints/:id/requests` | Borrar historial del endpoint |
| GET | `/api/endpoints/:id/stream` | Stream SSE en tiempo real |
| ANY | `/hooks/:id/*` | Capturar webhook y almacenarlo |

## Variables de entorno

| Variable | Descripcion | Default | Obligatoria |
|----------|-------------|---------|-------------|
| `PORT` | Puerto HTTP del servidor | `4000` | No |
| `DB_PATH` | Ruta del archivo SQLite | `./webhooks.db` | No |
| `LOG_LEVEL` | Nivel del logger `pino` | `info` | No |
| `MAX_BODY_SIZE` | Limite del body aceptado por Express | `1mb` | No |
| `DEFAULT_REQUEST_PAGE_SIZE` | Tamano por defecto de cada pagina | `50` | No |
| `MAX_REQUEST_PAGE_SIZE` | Limite maximo de pagina | `200` | No |
| `MAX_ENDPOINT_LABEL_LENGTH` | Longitud maxima permitida para labels | `80` | No |
| `MAX_SEARCH_LENGTH` | Longitud maxima del filtro `search` | `120` | No |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate limit | `60000` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Maximo de requests por ventana | `300` | No |

## Seguridad y observabilidad

- `helmet` para headers de seguridad.
- Rate limiting global con `express-rate-limit`.
- Respuestas JSON consistentes con `success`, `message` y `data`.
- Logger estructurado con timestamps ISO.
- `/metrics` y `/health` exponen estado util para monitoreo.
- La UI escapa labels, paths, headers y query params para evitar XSS.

## Docker

```bash
docker build -t webhook-tester .
docker run --rm -p 4000:4000 -v "$(pwd)/data:/data" webhook-tester
```

## Desarrollo

```bash
make dev
make test
make docker
```

## Roadmap

- Exportacion de requests a JSON o cURL desde la UI.
- Persistencia y replay programado de webhooks capturados.
- Autenticacion opcional para despliegues multiusuario.

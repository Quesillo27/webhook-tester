# webhook-tester

![Node.js](https://img.shields.io/badge/node-20-green) ![Express](https://img.shields.io/badge/express-4.x-blue) ![SQLite](https://img.shields.io/badge/sqlite-embedded-orange) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

Self-hosted webhook inspector. Recibe y visualiza webhooks en tiempo real desde el navegador, con actualizaciones via SSE sin polling. Similar a webhook.site pero en tu propio servidor.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/webhook-tester
cd webhook-tester
npm install
```

## Uso

```bash
npm start   # inicia el servicio en puerto 4000
```

Abre `http://localhost:4000` en tu navegador, crea un endpoint y copia la URL generada.

## Ejemplo

```bash
# 1. Crear un endpoint via API
curl -X POST http://localhost:4000/api/endpoints \
  -H "Content-Type: application/json" \
  -d '{"label": "Mi webhook de prueba"}'
# → {"endpoint":{"id":"abc123XYZ0","label":"Mi webhook..."},"url":"/hooks/abc123XYZ0"}

# 2. Enviar un webhook a ese endpoint (cualquier metodo funciona)
curl -X POST http://localhost:4000/hooks/abc123XYZ0 \
  -H "Content-Type: application/json" \
  -d '{"event":"user.created","userId":42}'
# → {"received":true,"requestId":1,"endpointId":"abc123XYZ0","timestamp":1712345678000}

# 3. Ver todos los requests recibidos
curl http://localhost:4000/api/endpoints/abc123XYZ0/requests
# → {"requests":[{"id":1,"method":"POST","path":"/hooks/abc123XYZ0","body":"{\"event\":\"user.created\"...}"}],"total":1}
```

## API

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio y conexiones activas |
| POST | `/api/endpoints` | Crear nuevo endpoint webhook |
| GET | `/api/endpoints` | Listar todos los endpoints |
| GET | `/api/endpoints/:id` | Obtener info de un endpoint |
| DELETE | `/api/endpoints/:id` | Eliminar endpoint y sus requests |
| GET | `/api/endpoints/:id/requests` | Listar requests recibidos |
| DELETE | `/api/endpoints/:id/requests` | Borrar todos los requests |
| GET | `/api/endpoints/:id/stream` | SSE stream (tiempo real) |
| ANY | `/hooks/:id/*` | Recibir webhook (cualquier metodo) |

## Caracteristicas

- **Tiempo real** via SSE (Server-Sent Events) — sin polling, sin WebSockets
- **Historial persistente** — SQLite embebido, los requests se guardan entre reinicios
- **Multi-endpoint** — crea tantos endpoints como necesites
- **Inspector completo** — ve headers, query params, body y raw JSON
- **Todos los metodos** — POST, GET, PUT, PATCH, DELETE y cualquier otro
- **Dark UI** — interfaz moderna con resaltado de metodos HTTP

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| PORT | 4000 | Puerto del servidor |
| DB_PATH | ./webhooks.db | Ruta del archivo SQLite |

## Docker

```bash
docker build -t webhook-tester .
docker run -p 4000:4000 -v ./data:/data webhook-tester
```

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar.

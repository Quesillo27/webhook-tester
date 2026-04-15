FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY public/ ./public/

ENV PORT=4000
ENV DB_PATH=/data/webhooks.db

VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health', r => r.statusCode===200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

USER node
CMD ["node", "src/server.js"]

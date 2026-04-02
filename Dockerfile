# Debian-based image: pdf-parse pulls @napi-rs/canvas (prebuilt linux-gnu binaries).
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Runtime creates uploads/; expose default local port (cloud sets PORT).
EXPOSE 3000

CMD ["node", "server.js"]

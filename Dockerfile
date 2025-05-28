# Multi-stage build for production
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY frontend/package.json ./frontend/
RUN cd frontend && bun install --frozen-lockfile
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS frontend-builder
WORKDIR /app
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend/ ./frontend/
RUN cd frontend && bun run build

FROM oven/bun:1 AS backend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=frontend-builder /app/frontend/dist ./dist-frontend
RUN bun run build:backend

FROM node:18-slim AS runtime
# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgtk-4-1 \
    libu2f-udev \
    libvulkan1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/dist-frontend ./dist-frontend
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/app.js"]

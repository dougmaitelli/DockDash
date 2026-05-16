# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (leverage Docker cache)
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN corepack enable && \
    if [ -f pnpm-lock.yaml ]; then \
      corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy source code
COPY . .

# Build server and client
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

# Add non-root user
RUN addgroup --system --gid 1001 dockdash && \
    adduser --system --uid 1001 dockdash

# Copy built assets
COPY --from=builder --chown=dockdash:dockdash /app/dist/. ./
COPY --from=builder --chown=dockdash:dockdash /app/package.json ./package.json
COPY --from=builder --chown=dockdash:dockdash /app/node_modules ./node_modules

# Create data directory for SQLite
RUN mkdir -p /app/data && chown dockdash:dockdash /app/data

USER dockdash

EXPOSE 3001

ENV PORT=3001
ENV DOCKER_HOST=unix:///var/run/docker.sock
ENV NETWORK_CIDRS=192.168.1.0/24
ENV SCAN_PORTS=80,443,3000,3001,5432,6379,8080,8443,9090,27017,22,3306
ENV DB_PATH=/app/data/dockdash.db
ENV REFRESH_INTERVAL=30000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]

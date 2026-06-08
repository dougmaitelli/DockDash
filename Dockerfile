# Stage 1: Build
ARG APP_REPO
ARG APP_VERSION=dev
FROM node:20-alpine AS builder
ARG APP_REPO
ARG APP_VERSION

WORKDIR /app

COPY package.json yarn.lock ./
RUN apk add --no-cache python3 make g++ && \
    corepack enable && yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Prune devDependencies before copying to runner
RUN yarn install --production --ignore-scripts

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist/. ./
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle

RUN mkdir -p /app/data

VOLUME ["/app/data"]

EXPOSE 3001

ENV APP_REPO=$APP_REPO
ENV APP_VERSION=$APP_VERSION
ENV PORT=3001
ENV DOCKER_HOST=unix:///var/run/docker.sock
ENV NETWORK_CIDRS=192.168.0.1/24
ENV SCAN_PORTS=
ENV DB_PATH=/app/data/dockdash.db
ENV REFRESH_INTERVAL=30000
ENV HEALTH_CHECK_INTERVAL=30000
ENV UPDATE_CHECK_INTERVAL=3600000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]

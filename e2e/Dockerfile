FROM node:26.7.0-bookworm-slim AS node
FROM mcr.microsoft.com/playwright:v1.62.1-noble
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.20.0
WORKDIR /work
ENV CI=true
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm typecheck:e2e && pnpm test:e2e"]

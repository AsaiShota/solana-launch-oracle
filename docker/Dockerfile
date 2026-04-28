FROM node:20-bookworm-slim AS builder

WORKDIR /app

# better-sqlite3 needs build tools to compile native bindings.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --include=dev --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && \
    cp src/db/*.sql dist/db/

# --- runtime stage -------------------------------------------------------
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist

# Persistent SQLite location. Railway disallows the Dockerfile VOLUME keyword
# (they manage volumes themselves) so we just create the dir; mount a volume
# here via docker-compose or Railway/Render's volume UI.
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/launches.db

EXPOSE 3000
CMD ["node", "dist/index.js"]

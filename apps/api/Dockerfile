# ==============================================================================
# Production Dockerfile for @slot-machine/api
# Multi-stage build with non-root runtime user
# ==============================================================================

# --- Stage 1: Build & compile TypeScript ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/

# Install dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source trees
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

# Compile contracts first, then API
RUN npm run build --workspace @slot-machine/contracts && \
    npm run build --workspace @slot-machine/api

# Remove devDependencies to produce a lean production node_modules tree
RUN npm prune --omit=dev

# --- Stage 2: Minimal unprivileged runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Copy root manifest and pruned node_modules
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy contracts build and package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist

# Copy API build, migrations, and package.json
COPY apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/migrations ./apps/api/migrations

# Switch to standard unprivileged node user
USER node

# Expose internal API port (not published to host in production Compose)
EXPOSE 3000

# Container health probe checking readiness endpoint
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3000/healthz").then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))'

# Default command starts the Fastify server
CMD ["node", "apps/api/dist/server.js"]

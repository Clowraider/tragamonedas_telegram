# ==============================================================================
# Production Dockerfile for @slot-machine/web
# Multi-stage build serving static Telegram Mini App assets via Nginx
# ==============================================================================

# --- Stage 1: Build TypeScript bundle ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy sources
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

# Build contracts and web app
RUN npm run build --workspace @slot-machine/contracts && \
    npm run build --workspace @slot-machine/web

# --- Stage 2: Production Nginx static server ---
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built application assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/dist
COPY --from=builder /app/apps/web/src/styles /usr/share/nginx/html/styles
COPY --from=builder /app/apps/web/index.html /usr/share/nginx/html/index.html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose internal HTTP port (served to Caddy on private Docker network)
EXPOSE 80

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

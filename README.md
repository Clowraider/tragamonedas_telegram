# Slot Machine Telegram Mini App (MVP)

> **Telegram Mini App & Fastify Backend**: Production-grade Telegram Mini App demonstrating clean architecture, strict database-level concurrency control (`FOR UPDATE` row locking), cryptographic outcome generation, and resilient idempotent settlement.

---

## 🎮 Virtual Credits & Real-Money Ready

- **Modo actual**: Funciona con créditos virtuales (sin dinero real).
- **Listo para dinero real**: La arquitectura está diseñada con control transaccional estricto (`FOR UPDATE`), balance atómico e idempotencia, lista para adaptarse e integrar pasarelas de pago (Stripe, TON/Crypto, depósitos/retiros) rápidamente.

---

## Architecture Overview

The system is organized as an **npm workspaces** modular monorepo:

```
slot-machine-mvp/
├── apps/
│   ├── api/                 # Fastify TypeScript modular monolith
│   │   ├── src/
│   │   │   ├── auth/        # Telegram WebApp HMAC & Development auth adapters
│   │   │   ├── db/          # PostgreSQL pool, migrations, player bootstrap
│   │   │   ├── game/        # Immutable rules, CSPRNG engine, payout evaluator
│   │   │   ├── routes/      # /v1/me, /v1/spins, /healthz, /readyz, /metrics
│   │   │   ├── spins/       # Atomic FOR UPDATE transaction & idempotency service
│   │   │   ├── app.ts       # Fastify instance builder & plugin composition
│   │   │   ├── config.ts    # Zod-validated environment schema & security guards
│   │   │   └── server.ts    # Process entrypoint & graceful shutdown lifecycle
│   │   └── Dockerfile       # Lean multi-stage Node 22 alpine image
│   └── web/                 # React 19 Telegram WebApp UI
│       ├── src/
│       │   ├── api.ts       # Typed API client with requestId propagation
│       │   ├── app.tsx      # Application root & Telegram initialization
│       │   ├── telegram.ts  # Telegram WebApp SDK bindings & fallback detection
│       │   ├── slot/        # SlotMachine cabinet, 3-reel display, useSpin hook
│       │   └── styles/      # Accessible CSS animations & theme tokens
│       ├── nginx.conf       # Security headers, CSP frame-ancestors, caching
│       └── Dockerfile       # Multi-stage builder + static Nginx server
├── packages/
│   └── contracts/           # Shared Zod schemas, error codes & TypeScript interfaces
├── deploy/                  # Production Docker Compose, Caddy TLS, Prometheus
│   ├── compose.yaml         # Isolated multi-container stack
│   ├── Caddyfile            # Automatic TLS reverse proxy & Telegram CSP
│   ├── prometheus.yml       # Metrics scraping configuration
│   ├── PROXMOX.md           # Proxmox VE deployment & operations guide
│   └── scripts/             # Automated backup.sh & isolated restore.sh drills
└── tests/
    └── e2e/                 # Playwright browser release candidate suite
```

### Core Architecture Highlights

| Area                       | Implementation Decision                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity & Auth**        | Dual-mode adapter. Production strictly validates Telegram WebApp `initData` via HMAC-SHA256 with `auth_date` freshness check (never trusts `initDataUnsafe`). Development mode provides isolated dev-identity fallback; production rejects development auth at startup. |
| **Atomic Settlement**      | PostgreSQL single-transaction settlement with `FOR UPDATE` wallet row locking. Prevents concurrent double-spending and enforces non-negative credit balance at the database constraint level (`CHECK (balance >= 0)`).                                                  |
| **Idempotency & Recovery** | Client sends a UUID `Idempotency-Key` on every spin. Replayed requests with identical parameters return the cached outcome with HTTP 200 without charging credits again. Hash mismatch triggers HTTP 409 `IDEMPOTENCY_CONFLICT`.                                        |
| **Game Engine**            | Pure functional payout engine with injected CSPRNG (`node:crypto.randomInt`). All reel strips, probabilities, and payout multipliers are immutable and version-tagged (`GAME_VERSION=classic-1`).                                                                       |
| **Frontend Animation**     | State-driven reel animation. Client NEVER predicts or computes outcomes; reels spin until the authoritative backend response is received, settling precisely on the server-persisted symbols. Fully supports `prefers-reduced-motion`.                                  |
| **Observability**          | Independent `/healthz` (liveness) and `/readyz` (database connectivity). Prometheus `/metrics` endpoint tracks spin counters, latency gauges, and settlement failures with zero sensitive telemetry leakage.                                                            |

---

## Architectural Scope (MVP)

To keep the MVP resilient, focused, and simple to operate, the core design decisions are:

- 💳 **Pagos externos modulares**: No incluidos por defecto en el core MVP para mantenerlo liviano, pero el motor de billetera y transacciones está desacoplado para conectar pasarelas de pago (Stripe, TON/crypto) fácilmente.
- ⚡ **Sin Redis ni Message Queues**: PostgreSQL actúa como única fuente de verdad; el bloqueo por fila elimina la complejidad de sincronización distribuida.
- 📦 **Despliegue unificado**: Un único stack Docker Compose en Proxmox/VM cubre todas las necesidades operativas sin sobreingeniería de Kubernetes.
- 🔒 **Reglas de juego inmutables**: La configuración de pagos y carretes es propiedad del código y versionada por `game_version`.

---

## Quick Start / Local Development

### Prerequisites

- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **PostgreSQL**: `>= 14.0`

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> slot-machine-mvp
cd slot-machine-mvp
npm install
```

### 2. Environment Configuration

Create a local `.env` file in the project root:

```bash
cp .env.example .env
```

Example development configuration:

```ini
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://slot:slot@localhost:5432/slot_machine
APP_SECRET=dev-secret-change-me-7f8a1b2c3d4e5f6a7b8c9d0e
AUTH_MODE=development
DEFAULT_BALANCE=1000
DEFAULT_STAKE=10
GAME_VERSION=classic-1
```

### 3. Run Database Migrations

Ensure PostgreSQL is running and the database exists, then run:

```bash
npm run build --workspace @slot-machine/contracts
npm run build --workspace @slot-machine/api
npm run migrate --workspace @slot-machine/api
```

### 4. Build and Run

```bash
# Build contracts and all workspaces
npm run build

# Start the Fastify API server
node apps/api/dist/server.js
```

In development mode (`AUTH_MODE=development`), opening the web app connects automatically with a mock developer player identity with 1,000 virtual credits.

---

## Telegram Bot Integration Setup

To run the Mini App inside Telegram:

1. **Create Bot**: Open [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot`. Note the generated `TELEGRAM_BOT_TOKEN`.
2. **Create Web App**: Send `/newapp` to `@BotFather`, select your bot, provide a title/description, and set the Web App URL (e.g., `https://your-domain.com`).
3. **Configure Environment**: Set the bot token in your production environment:
   ```ini
   NODE_ENV=production
   AUTH_MODE=telegram
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
4. **Launch Mini App**: Attach the bot to a menu button or launch link (`https://t.me/YourBot/app`). The Telegram client automatically signs `initData` when opening the WebApp.

---

## Deployment and Operations (Docker & Proxmox)

The production stack is fully containerized with Docker Compose and fronted by Caddy with Automatic TLS:

```
Internet (TLS / HTTPS)
       │
       ▼
┌──────────────┐
│  Caddy (TLS) │ :80, :443
└──────┬───────┘
       │ [slot_internal_net - Private Bridge]
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Web App    │          │  Fastify API │          │  PostgreSQL  │
│(Nginx Static)│          │   (Node 22)  │          │ (Persistence)│
└──────────────┘          └──────┬───────┘          └──────────────┘
                                 ├─────────────────────────┐
                          ┌──────▼───────┐          ┌──────▼───────┐
                          │  Prometheus  │          │  Admin Panel │
                          │  (Scraper)   │          │ (Port :3001) │
                          └──────────────┘          └──────────────┘
```

### 1. Launch Stack with Docker Compose

1. **Navigate to the deployment directory and prepare the environment file**:
   ```bash
   cd deploy
   cp .env.example .env
   ```

2. **Configure your `.env` file**:
   - `DOMAIN`: Tu dominio público apuntando a tu servidor (ej: `slot.midominio.com` o tu IP).
   - `TELEGRAM_BOT_TOKEN`: Token obtenido de [@BotFather](https://t.me/BotFather).
   - `APP_SECRET`: Clave aleatoria de 32+ caracteres para firmado criptográfico.
   - `ADMIN_API_KEY`: Clave secreta para acceder al panel de administración en el puerto 3001.
   - `POSTGRES_PASSWORD`: Contraseña segura para la base de datos.

3. **Levantar el stack completo (construcción y arranque en segundo plano)**:
   ```bash
   docker compose up -d --build
   ```

   El stack levantará automáticamente:
   - **PostgreSQL 16** con volumen persistente.
   - **Contenedor de Migraciones** (aplica esquemas y tablas antes de levantar la API).
   - **Fastify API**: Servicio modular en Node 22 (puerto 3000 interno y puerto 3001 para el Admin Dashboard).
   - **Web App**: Bundle estático de React servido por Nginx con cabeceras de seguridad para Telegram.
   - **Caddy Reverse Proxy**: Gestión automática de certificados SSL/TLS Let's Encrypt (puertos 80 y 443).
   - **Prometheus**: Recolección interna de telemetría y métricas operativas.

4. **Verificar el estado de los contenedores**:
   ```bash
   docker compose ps
   docker compose logs -f api
   ```

### 2. Operational Probes & Admin Dashboard

- **Liveness Probe**: `GET /healthz` (returns HTTP 200 `{ "status": "ok" }` on port `:3000`)
- **Readiness Probe**: `GET /readyz` (verifies PostgreSQL connection on port `:3000`)
- **Metrics**: `GET /metrics` (scraped by Prometheus over internal network)
- **Admin Dashboard (Port 3001)**:
  - Web Console: `http://localhost:3001/` (or your host IP `http://<ip>:3001/`)
  - Authenticated via `ADMIN_API_KEY` (Header `x-admin-api-key` or login dialog).
  - Features: Real-time global KPIs (players, circulating credits, RTP, settled rounds), player search with Telegram username inspection, atomic audited credit adjustments (`+N`, `-N`, `=N`), live 50-spin feed, and immutable audit logs.

### 3. Backup and Restore Procedures

- **Automated Backup**:

  ```bash
  deploy/scripts/backup.sh
  ```

  Creates a timestamped, gzip-compressed SQL dump with a SHA-256 checksum in `/var/backups/slot_machine`. Automatically cleans up backups older than 7 days.

- **Isolated Restore Verification Drill**:

  ```bash
  deploy/scripts/restore.sh --isolated /var/backups/slot_machine/backup_latest.sql.gz
  ```

  Spins up an ephemeral PostgreSQL schema, restores the backup, and verifies all database tables, wallet balance constraints, and spin round audit consistency.

- For full Proxmox VE guest setup (LXC/VM, systemd auto-start, cron jobs, zero-downtime rolling updates, and rollback steps), consult [deploy/PROXMOX.md](deploy/PROXMOX.md).

---

## Testing & Quality Verification Matrix

The codebase is validated across multiple layers with automated suites:

| Test Layer                 | Framework               | Scope & Invariants Covered                                                                                                  |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Unit Tests**             | Vitest                  | Payout rules, RNG uniform distribution, Telegram HMAC SHA-256 validation, UI state reducer, reduced motion handling.        |
| **Database & Concurrency** | Vitest + PostgreSQL     | `FOR UPDATE` row locking, concurrent double-spend prevention, rollback on error, unique idempotency constraints.            |
| **HTTP & Security**        | Vitest + Fastify Inject | Contract schemas, request ID propagation, production auth guard (rejection of dev auth in prod), privacy redaction in logs. |
| **Component Tests**        | React Testing Library   | Accessible DOM reels, central payline marker, outcome banners, disclaimer visibility, absence of value-bearing controls.    |
| **End-to-End Release**     | Playwright + Chromium   | Full development bootstrap, spin round animation, settle state, balance update, error recovery, history, and health probes. |

### Running the Test Suites

```bash
# Run unit & integration tests
npm test

# Run full typecheck across all workspaces
npm run typecheck

# Run linter
npm run lint

# Run code format verification
npm run format:check

# Run End-to-End Playwright test suite
npm run test:e2e

# Full build verification
npm run build
```

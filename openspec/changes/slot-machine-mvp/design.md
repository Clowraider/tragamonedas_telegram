# Design: Slot Machine MVP

## Technical Approach

Build one npm-workspaces repository containing a React/TypeScript/Vite Mini App, a Fastify TypeScript modular monolith, and shared API contracts. PostgreSQL is the only state store. The slice authenticates a player, exposes the wallet/config snapshot, executes one fixed-stake three-reel/one-payline spin atomically, and animates only the persisted server result.

**Detected facts:** the workspace has OpenSpec artifacts but no application, package manifest, tests, CI, or VCS metadata. The design below is recommended, not detected.

## Architecture Decisions

| Decision       | Alternatives / tradeoff                                                         | Choice and rationale                                                                                                         |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Repository     | Separate repositories add release coordination                                  | npm workspaces: `apps/web`, `apps/api`, `packages/contracts`; one lockfile and independently built images                    |
| API            | NestJS adds DI/decorator structure; microservices add distributed failure modes | Standalone Fastify plugins: schema validation, Pino logging, and injection testing provide enough boundaries with less setup |
| Persistence    | Redis or queues add duplicate state; ORM hides critical locking                 | PostgreSQL plus `pg` and SQL migrations; explicit transactions make wallet invariants reviewable                             |
| Game execution | Client RNG is untrusted; stored RNG state is sensitive                          | Pure payout engine with injected `RandomSource`; production uses `node:crypto.randomInt`, tests use deterministic sequences  |
| Configuration  | Mutable admin configuration expands scope                                       | Versioned, immutable code-owned reel/payout config; persist `game_version` and all outcome inputs on every round             |
| Deployment     | Kubernetes and multi-VM HA are disproportionate                                 | One Docker-capable Proxmox VM/LXC running Compose; Caddy terminates TLS, DB remains private                                  |

Redis, Kubernetes, microservices, real money, cash-out/payments, and retention/reward/event systems are explicitly excluded.

## Data Flow

```text
Telegram initData -> auth adapter -> player bootstrap -> GET /v1/me
Spin + idempotency key -> wallet row lock -> prior-round check -> CSPRNG
  -> payout engine -> round insert + wallet update -> commit -> response
  -> CSS reel animation settles to response symbols
```

Production accepts only Telegram `initData`, verifies Telegram's HMAC and `auth_date` age, and never trusts `initDataUnsafe`. `DevAuthProvider` is registered only when `AUTH_MODE=development`; startup fails with `NODE_ENV=production`. Production Compose pins `AUTH_MODE=telegram` and has no development credential.

Inside one transaction, lock the player's wallet `FOR UPDATE`, re-check `(player_id, idempotency_key)`, reject mismatched replay fingerprints, validate balance/config, generate three stops, evaluate payout, insert the settled round, and update the wallet. A unique constraint is the final duplicate guard; retries return the original representation.

## Planned Files

| Path                                                                                                                | Purpose                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `package.json`, `tsconfig.base.json`                                                                                | Workspaces and shared compiler policy                  |
| `packages/contracts/src/index.ts`                                                                                   | Request/response schemas and error codes               |
| `apps/api/src/app.ts`, `server.ts`                                                                                  | Fastify composition and process entry                  |
| `apps/api/src/auth/{telegram,development}.ts`                                                                       | Mutually exclusive identity adapters                   |
| `apps/api/src/game/{config,engine,random}.ts`                                                                       | Immutable rules, payout, RNG port/adapters             |
| `apps/api/src/spins/spin.service.ts`                                                                                | Transaction and idempotency boundary                   |
| `apps/api/src/routes/{me,spins,health,metrics}.ts`                                                                  | HTTP surface                                           |
| `apps/api/src/db/{pool,migrate}.ts`, `apps/api/migrations/001_initial.sql`                                          | PostgreSQL access and schema                           |
| `apps/web/src/{app,api,telegram}.ts`, `apps/web/src/slot/{SlotMachine,useSpin}.tsx`, `apps/web/src/styles/slot.css` | Bootstrap, state machine, accessible DOM/CSS reels     |
| `deploy/{compose.yaml,Caddyfile,prometheus.yml,.env.example}`                                                       | TLS, private networks, services, probes, scrape config |
| `deploy/scripts/{backup,restore}.sh`, `deploy/PROXMOX.md`                                                           | Encrypted/off-host backup guidance and restore drill   |
| `apps/*/test/`, `tests/e2e/spin.spec.ts`                                                                            | Unit, integration, component, and browser tests        |

## Interfaces / Contracts

```text
GET /v1/me -> { playerId, balance, stake, gameVersion, recentRound? }
POST /v1/spins
  Headers: Authorization: "tma <initData>"; Idempotency-Key: UUID
  Body: { stake: integer, gameVersion: string }
  201/200 -> { roundId, symbols:[string,string,string], stake, payout,
               balanceBefore, balanceAfter, gameVersion, createdAt }
GET /v1/spins/:roundId -> same round representation
Errors -> { code, message, requestId }; 409 IDEMPOTENCY_CONFLICT,
          422 INSUFFICIENT_CREDITS|GAME_VERSION_MISMATCH
```

Tables: `players(id, auth_provider, provider_subject, created_at)` with unique provider identity; `wallets(player_id, balance integer CHECK balance>=0, version)`; `spin_rounds(id, player_id, idempotency_key, request_fingerprint, game_version, stake, reel_stops integer[3], symbols text[3], payout, balance_before, balance_after, created_at)` with unique player/key and ownership index.

Frontend states are `booting -> ready -> requesting -> animating -> settled|error`. Reels do not reveal a result before the response; retry reuses the same key, refresh reloads `/me`, and reduced-motion settles immediately.

## Testing Strategy

| Layer         | Coverage                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest) | Payouts, fixed stake, deterministic RNG seam, auth-date/HMAC cases, UI state reducer                                                            |
| Integration   | Fastify `inject` plus disposable PostgreSQL: rollback, insufficient funds, duplicate/mismatched keys, concurrent spins, auth-mode startup guard |
| Component/E2E | Testing Library animation/recovery/accessibility; Playwright development-auth spin, refresh, balance, and health smoke                          |

## Operations and Rollout

Caddy serves web and proxies `/v1`; API, PostgreSQL, and Prometheus use a private network, and only Caddy publishes ports. `/health/live`, `/health/ready` (DB check), and private `/metrics` expose spin counters, latency, replays, transaction failures, and DB readiness. JSON logs redact authorization/initData and include request, player, and round IDs.

Apply migrations before API rollout; back up first. Roll back images only while schema-compatible; preserve round audit rows and restore from a tested backup rather than reversing destructive migrations.

## Open Questions

None blocking. Proxmox guest type, public hostname, and starting balance may be selected during deployment without changing contracts.

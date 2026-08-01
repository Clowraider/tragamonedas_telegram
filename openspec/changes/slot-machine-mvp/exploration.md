## Exploration: slot-machine-mvp

### Current State
The workspace is a greenfield project: no application source, package manifest, build configuration, CI configuration, test suite, or VCS metadata exists. OpenSpec is initialized at `openspec/`, with project rules identifying a portfolio-grade Telegram Social Casino Mini App, a slot-machine first vertical slice, and a strict virtual-credits-only boundary.

The product goal is to demonstrate production-grade engineering for a serious Telegram Mini App, not to operate a casino. The MVP MUST exclude real-money deposits, wagering with value, cash-out, tokens/blockchain, Telegram Stars, login rewards, events, rankings, referrals, multiple games, KYC, and regulated operation. The supplied visual reference is useful for polish, but its broader meta-game surface should not be copied into this MVP.

#### Proposed MVP user flow
1. A user opens the Mini App from a Telegram bot button or opens a development URL outside Telegram.
2. The client initializes Telegram context when available; outside Telegram it uses an explicit development identity/fallback and visibly labels the environment.
3. The client requests the current player snapshot: virtual-credit balance, immutable game configuration/version, and any pending/recent round needed for recovery.
4. The player presses **Spin**. The client creates an idempotency key and sends a server request; it MUST NOT calculate or trust the outcome locally.
5. The server validates the player, game version, balance, and request key, atomically reserves/deducts virtual credits, generates the outcome, records the round, and returns the authoritative result and resulting balance.
6. The client animates the reels toward the returned result, shows win/loss and balance changes, and can recover by querying the round if the network fails.
7. The player can repeat the loop or restart; no reward economy, social layer, or additional game is required.

#### Minimum server-authoritative model
The smallest credible model is a modular monolith with an explicit game engine boundary:
- `Player`: stable internal ID, Telegram user ID when available, timestamps, and environment/development marker.
- `Wallet`: virtual-credit integer balance and version/updated timestamp. Credits are non-cash and have no redemption value.
- `SpinRound`: UUID/idempotency key, player ID, game/config version, bet in virtual credits, outcome symbol indexes, payout, balance before/after, status, timestamps, and correlation ID.
- `GameConfig`: versioned reel symbols, payout table, minimum balance/bet rules, and enabled status. Configuration is server-owned and immutable per round.

The spin transaction MUST use a database transaction with a row lock or optimistic version check so balance cannot be double-spent. A unique constraint on `(player_id, idempotency_key)` MUST make retries return the original result rather than create another round. The API should expose `GET /me`, `POST /spins`, and `GET /spins/{id}` (or equivalent), with request validation, bounded payloads, and consistent error codes.

#### RNG and fairness boundary
Use a cryptographically secure server-side RNG from the runtime/platform for each authoritative outcome. The outcome generator MUST be isolated behind an interface so deterministic seeded testing is possible without weakening production randomness. Persist the outcome and game-config version, but do not expose internal RNG state. A future fairness-verification scheme can be deferred; it is not required for a virtual-credit portfolio MVP, but the round record must make replay/audit of the applied payout calculation possible.

#### Observability requirements for the slice
Emit structured JSON logs with request ID, correlation ID, player ID (internal or privacy-safe), round ID, game version, outcome class, latency, and error code; never log Telegram init data, secrets, or unnecessary personal data. Add metrics for spin requests, accepted/rejected/idempotent spins, latency, transaction failures, insufficient balance, and database health. Add a health/readiness endpoint and document a minimal dashboard/alert set. OpenTelemetry is valuable, but a small structured logging plus metrics implementation is enough if the deployment choice makes full tracing disproportionate.

### Affected Areas
- `openspec/config.yaml` — already records the greenfield constraints, testing gap, and explicit exclusions that this change must preserve.
- `openspec/changes/slot-machine-mvp/exploration.md` — this exploration artifact; no application code is present yet.
- Future frontend package (for example `apps/web/`) — Telegram bootstrap, development fallback, slot rendering, request state, animation, recovery, and accessible status messaging.
- Future backend package (for example `apps/api/`) — Telegram context validation boundary, player/balance APIs, spin transaction, idempotency, RNG, configuration, and health endpoints.
- Future database migrations (for example `apps/api/migrations/`) — player, wallet, round, and versioned configuration persistence with constraints/indexes.
- Future deployment assets (for example `deploy/docker-compose.yml`, `deploy/` or `infra/`) — image builds, reverse proxy/TLS boundary, secrets, persistence, backups, and Proxmox topology documentation.
- Future tests (for example `apps/api/test/` and `apps/web/test/`) — deterministic game rules, transactional/idempotency behavior, API contracts, rendering states, and one browser-level smoke flow.

### Approaches
1. **DOM/CSS/React slot renderer with a modular-monolith API** — Render reels, symbols, overlays, controls, and responsive layout with React and CSS; use CSS transitions/keyframes for the polished spin animation, while the server remains authoritative.
   - Pros: smallest dependency and asset surface; excellent Telegram/mobile web accessibility; easy responsive design and screenshots; straightforward unit/component testing; ideal for one mostly static slot screen.
   - Cons: more manual work for complex particle effects, sprite choreography, and game-like transitions; CSS animation timing must be coordinated carefully with the authoritative result.
   - Effort: Low/Medium.

2. **PixiJS or Phaser embedded in a React shell** — Use a 2D renderer/game loop for reels and effects, with React handling application chrome and data state.
   - Pros: stronger animation primitives, sprite batching, particles, and a credible path to richer game presentation; Phaser supplies more game-oriented conventions.
   - Cons: extra bundle and lifecycle complexity; accessibility and responsive layout require a parallel DOM layer; testing canvas output is harder; premature for one screen with no real-time simulation.
   - Effort: Medium/High.

3. **Backend-for-frontend plus separate game service and infrastructure stack** — Split Telegram/session, wallet, and slot execution into independently deployed services, with Redis/event streaming from the start.
   - Pros: demonstrates service boundaries and independent scaling; resembles a larger casino platform.
   - Cons: creates distributed failure modes, deployment burden, and operational noise before the product loop is proven; makes idempotency and local development harder; overstates production maturity for a single game.
   - Effort: High.

4. **Single-process demo with client-side outcome calculation** — Keep balance and spin outcome in the browser for visual speed, optionally persisting later.
   - Pros: fastest visual prototype and no database dependency.
   - Cons: not server-authoritative, trivially tamperable, impossible to demonstrate correct concurrency/idempotency, and contradicts the portfolio goal.
   - Effort: Low, but rejected for the MVP.

### Recommendation
Choose Approach 1: React + TypeScript + Vite for the Mini App, DOM/CSS rendering for the slot, and a TypeScript modular-monolith API using a lightweight HTTP framework (NestJS/Fastify only if its structure earns the added setup). Use PostgreSQL as the source of truth; omit Redis until a measured need exists. Keep the game engine as a pure domain module inside the API and keep Telegram adapter code at the edge.

Deploy one frontend image and one API image behind a reverse proxy on a small Proxmox VM running Docker Compose, with PostgreSQL on the same VM only for the first demonstrator or on a separate protected VM if the host already supports it. Use persistent volumes, private database networking, TLS at the proxy, environment-injected secrets, scheduled backups, and documented restore steps. Do not claim high availability; demonstrate the topology, health checks, backup/restore, logs, and a bounded scale path instead.

This is the smallest architecture that still demonstrates the important skills: trusted server-side game rules, atomic virtual-credit accounting, retry-safe APIs, versioned configuration, testable RNG boundaries, secure Telegram integration, observable containers, and an actual self-hosted deployment. Phaser/Pixi can be introduced later if visual requirements exceed CSS; splitting services can be justified later by load or team boundaries.

#### Testing scope
- Unit tests: payout evaluation, symbol/result validation, balance rules, deterministic seeded RNG adapter, and error mapping.
- API/integration tests: spin transaction, insufficient balance, concurrent requests, duplicate idempotency key, failed transaction rollback, configuration versioning, and Telegram-vs-development identity boundary.
- Frontend component tests: loading, spinning, success, loss, rejection, retry/recovery, reduced-motion, and balance synchronization states.
- One browser smoke test against a disposable API/database: open the app, obtain development identity, spin, refresh/recover, and verify the authoritative balance.
- Contract tests for the small API surface are preferable to broad end-to-end coverage. No coverage percentage should be promised before a runner and project structure exist.

#### Defer deliberately
Defer real-money or value-bearing mechanics, all payment systems including Telegram Stars, tokens/blockchain, KYC/AML/geofencing, regulated operation, login rewards, events, rankings, referrals, multiple games, admin economy tooling, player inventory, social features, chat, websocket real-time play, Redis, event buses, microservices, advanced fairness proofs, multi-region HA, and a full analytics warehouse. Also defer polished meta-game systems from the reference image until the core spin loop has evidence of usability and the scope is explicitly re-approved.

### Risks
- Telegram init data is an authentication boundary; a development fallback MUST be isolated, clearly marked, and impossible to confuse with production identity validation.
- A balance update without a transaction and idempotency constraint can duplicate credits or spend the same credits twice under retries/concurrency.
- Client animation can imply an outcome before the server responds; the UI must present a pending state and animate only the authoritative result.
- Self-hosted Proxmox introduces backup, TLS, secrets, patching, and recovery responsibilities; a single VM is a demonstrator topology, not an availability guarantee.
- The project currently has no code, package manager configuration, test runner, or CI. The proposal/design phase must make these choices explicit rather than treating them as existing conventions.
- Virtual credits and casino presentation can still be misunderstood as gambling. Product copy and deployment documentation must repeatedly state that credits have no cash value and the MVP is not a regulated operator.
- A visually polished slot can consume disproportionate time. Establish a fixed screen/state acceptance boundary before adding effects or meta-game content.

### Recommendation Detail
The next design should define the exact API contract, transaction boundaries, schema constraints, state machine, Telegram adapter versus development adapter, animation state model, Docker/Proxmox deployment diagram, backup/restore procedure, and test seams. The proposal should preserve the explicit exclusions as non-goals and include rollback for database migrations and deployment changes.

### Ready for Proposal
Yes — the MVP boundary and smallest production-credible architecture are sufficiently clear for `sdd-propose` and then `sdd-design`. The proposal should state that this is a virtual-credit portfolio demonstrator, select DOM/CSS over Phaser/Pixi for the first slice, and treat PostgreSQL plus a modular monolith as the default until measured complexity justifies otherwise.

# Tasks: Slot Machine MVP

## Review Workload Forecast

| Field                   | Value              |
| ----------------------- | ------------------ |
| Estimated changed lines | 2,400–3,200        |
| 400-line budget risk    | High               |
| Chained PRs recommended | Yes                |
| Suggested split         | Slices 1 → 7 below |
| Delivery strategy       | ask-on-risk        |
| Chain strategy          | pending            |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

No Git operation; autonomous, verified slices.

### Suggested Work Units

| Unit | Goal                   | Completion boundary             |
| ---- | ---------------------- | ------------------------------- |
| 1    | Workspace/contracts    | Tooling checks pass             |
| 2    | Schema/identity/wallet | PostgreSQL bootstrap tests pass |
| 3    | Game/settlement        | Atomicity tests pass            |
| 4    | API/telemetry          | Contract/operations tests pass  |
| 5    | React experience       | UI tests pass                   |
| 6    | Deployment/recovery    | Compose/restore checks pass     |
| 7    | Acceptance/docs        | E2E flow passes                 |

## Phase 1: Bootstrap and Contracts (Unit 1)

- [x] 1.1 Create `package.json`, `tsconfig.base.json`, workspace manifests, ESLint/Prettier, Vitest, Playwright, and `.gitignore`; expose build, typecheck, lint, and test scripts.
- [x] 1.2 Define/test schemas, errors, spin representation, UUID key, and bounded history in `packages/contracts/src/index.ts`.

## Phase 2: Persistence, Identity, and Wallet (Unit 2)

- [x] 2.1 Add `apps/api/migrations/001_initial.sql` with `players`, `wallets`, `spin_rounds`, constraints/indexes; add `apps/api/src/db/{pool,migrate}.ts`.
- [x] 2.2 Implement `apps/api/src/auth/{telegram,development}.ts` and bootstrap service; test `Valid/Invalid Telegram launch`, development-fallback, `Identity returns`, and starting-balance scenarios.
- [x] 2.3 Test production startup rejection, provider isolation, wallet no-reset, and absence of value-bearing operations.

## Phase 3: Game and Atomic Spins (Unit 3)

- [ ] 3.1 Implement immutable rules, evaluator, and CSPRNG in `apps/api/src/game/{config,engine,random}.ts`; test `Valid spin`, `Invalid game terms`, and winning/non-winning outcomes.
- [ ] 3.2 Implement `apps/api/src/spins/spin.service.ts` using `FOR UPDATE`, fingerprints, one transaction, and replay; test funds, rollback, concurrency, and both retry scenarios.
- [ ] 3.3 Add owned recovery and bounded newest-first history; test `Recover own round` and `List history safely`.

## Phase 4: API and Observability (Unit 4)

- [ ] 4.1 Compose `apps/api/src/{app,server}.ts` and `routes/{me,spins}.ts` for `/v1/me` and spin create/recover/list; test auth, validation, statuses, request IDs.
- [ ] 4.2 Add `routes/{health,metrics}.ts`, Pino redaction, required metrics; test health/readiness and privacy-safe observability scenarios.

## Phase 5: React Experience (Unit 5)

- [ ] 5.1 Build `apps/web/src/{app,api,telegram}.ts`; label development mode and virtual credits with no cash value.
- [ ] 5.2 Build `slot/{SlotMachine,useSpin}.tsx` and `styles/slot.css`: three reels, central line, authoritative states, same-key recovery, CSS animation, reduced motion.
- [ ] 5.3 Test server resolution, reduced motion, repeated input, lost response, accessibility, and absence of value controls.

## Phase 6: Deployment and Recovery (Unit 6)

- [ ] 6.1 Add Dockerfiles and `deploy/{compose.yaml,Caddyfile,prometheus.yml,.env.example}` with TLS, private services, secrets, probes, volumes, migration ordering, Telegram-only auth.
- [ ] 6.2 Add `deploy/scripts/{backup,restore}.sh` and `deploy/PROXMOX.md`; document prerequisites, off-host backup, isolated restore, rollout, rollback, and restart/restore scenarios.

## Phase 7: Acceptance and Documentation (Unit 7)

- [ ] 7.1 Add `tests/e2e/spin.spec.ts` for development bootstrap, spin, refresh/recovery, balance, history, and health; cover `Release candidate is verified`.
- [ ] 7.2 Add `README.md` for setup, Telegram, architecture, disclaimer, operations, and exclusions; record verification evidence.

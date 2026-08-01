# Proposal: Slot Machine MVP

## Intent

Deliver a polished, portfolio-grade Telegram Mini App and an auditable virtual-credit slot loop on Proxmox without operating a commercial casino.

## Scope

### In Scope

- Server-validated Telegram identity plus isolated, visibly marked local-development fallback.
- Virtual starting balance and one fixed virtual-credit stake.
- Exactly three reels, one central winning line, server CSPRNG, and versioned payout evaluation.
- Atomic wallet/round persistence, idempotent retries, and round recovery/history.
- Responsive React/DOM/CSS animation resolving to the server outcome.
- Health/readiness, structured logs, metrics, Docker deployment, backups, and layered tests.

### Out of Scope

- Real money, cash-out, Stars, blockchain/tokens, KYC, or regulated operation.
- Login rewards, events, rankings, referrals, multiple games, bonus systems, or complex administration.

## Capabilities

### New Capabilities

- `player-identity`: Telegram validation, development fallback, and player bootstrap.
- `virtual-wallet`: Starting balance and atomic credit accounting.
- `slot-rounds`: Fixed-stake CSPRNG spins, payouts, persistence, idempotency, recovery, and history.
- `slot-experience`: Polished three-reel UI driven by server results.
- `service-operations`: Health, observability, tests, deployment, backup, and restore.

### Modified Capabilities

None.

## Approach

Use React/TypeScript/Vite with DOM/CSS animation and a TypeScript modular-monolith API. Keep identity adapters at the edge and a pure, deterministic-testable game engine behind a production CSPRNG adapter. PostgreSQL transactions lock/version wallets and enforce unique player/idempotency keys. Deploy frontend and API containers behind TLS with Docker Compose; omit Redis.

## Affected Areas

| Area                   | Impact | Description                                 |
| ---------------------- | ------ | ------------------------------------------- |
| `apps/web/`            | New    | Identity bootstrap and slot experience      |
| `apps/api/`            | New    | Identity, wallet, game, spin/history APIs   |
| `apps/api/migrations/` | New    | Durable models and constraints              |
| `deploy/`              | New    | Compose, TLS, backup/restore, Proxmox notes |
| `tests/`               | New    | Domain, API, UI, concurrency, smoke tests   |

## Risks

| Risk                                    | Likelihood | Mitigation                                    |
| --------------------------------------- | ---------- | --------------------------------------------- |
| Development identity reaches production | Medium     | Mode gating, labels, tests                    |
| Concurrency corrupts balances           | Medium     | Transactions, locking/versioning, unique keys |
| Animation diverges                      | Medium     | Animate authoritative results only            |
| Credits imply value                     | Medium     | Persistent no-cash-value messaging            |

## Rollback Plan

Stop Compose, restore prior images and a compatible database backup, then disable the bot URL. Preserve rounds; reverse only proven-safe migrations.

## Dependencies

- Telegram bot configuration, PostgreSQL, TLS proxy, Docker-capable Proxmox guest, and secrets.

## Success Criteria

- [ ] Telegram and development identities remain separated.
- [ ] Concurrent/duplicate spins create one round and balance change.
- [ ] Reels resolve to the persisted outcome and correct payout.
- [ ] History, recovery, operations, deployment, backup/restore, and tests work.
- [ ] No excluded capability is introduced.

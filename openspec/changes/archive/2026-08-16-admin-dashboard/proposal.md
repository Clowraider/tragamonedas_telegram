# Proposal: Admin Dashboard & Live Operations

## Intent

Provide operators with a secure, dedicated back-office interface to monitor real-time casino gameplay, inspect Telegram player profiles, and manage virtual test credit balances with full audit logging, fully isolated from public player traffic.

## Scope

### In Scope

- Dedicated, isolated admin HTTP server and back-office UI running on port `:3001` (separate from player app on `:3000`).
- Admin authentication via `ADMIN_API_KEY` supporting header `x-admin-api-key` and browser session cookie.
- Player identity enrichment: store and display Telegram ID, `@username`, `first_name`, registration timestamp, and virtual balance.
- Virtual credit management: manual adjustments (grant `+N`, deduct `-N` with zero-floor clamp/rejection, set `=N`) requiring a mandatory audit reason.
- Real-time operations monitoring: overview metrics (total players, circulating virtual credits, total settled spins, observed RTP) and a live feed of the 50 most recent spins.
- Compliance safeguards: explicit UI disclaimers identifying all balances as non-monetary virtual test credits.

### Out of Scope

- Real-money transactions, deposits, withdrawals, or payment gateway integrations.
- Multi-tier role-based access control (RBAC) or granular admin permissions beyond API key auth.
- Modifying random outcome generation or RTP tampering for individual players.

## Capabilities

### New Capabilities

- `admin-operations`: Isolated back-office interface and REST API on port 3001 for metrics observation, live spin feed, and player audit history.

### Modified Capabilities

- `player-identity`: Capture and store Telegram profile metadata (username, first name) during bootstrap for administrative tracking.
- `virtual-wallet`: Allow audited administrative balance adjustments (grant, deduct, set) while preserving non-negative integer invariants.

## Approach

Implement an isolated server module and back-office UI on port `:3001` with API key auth middleware. Apply a database migration to record Telegram metadata in `players` and track admin balance adjustments in an immutable `credit_audit_logs` table.

## Affected Areas

| Area                                      | Impact   | Description                                                                      |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `apps/api/migrations/`                    | Modified | Add `002_admin_and_metadata.sql` for player profile fields & audit log table.    |
| `apps/api/src/admin/`                     | New      | Admin Fastify server instance, routes, auth middleware, and services on `:3001`. |
| `apps/api/src/auth/`                      | Modified | Persist Telegram `username` and `first_name` on bootstrap.                       |
| `packages/contracts/`                     | Modified | Add TypeScript schemas and DTOs for admin endpoints and telemetry.               |
| `apps/admin/` or `apps/api/src/admin/ui/` | New      | Dedicated Admin Back-Office UI on `:3001`.                                       |

## Risks

| Risk                                | Likelihood | Mitigation                                                             |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Admin endpoint exposed to public    | Low        | Run on isolated port `:3001` with strict `ADMIN_API_KEY` verification. |
| Negative balance from manual deduct | Low        | Enforce database constraints and validation preventing balance < 0.    |
| Missing audit trail on adjustments  | Low        | Wrap adjustments and audit log insertion in atomic DB transactions.    |

## Rollback Plan

Revert admin server code and routes. Revert migration `002_admin_and_metadata.sql` or maintain backward compatibility with nullable columns.

## Dependencies

- Existing PostgreSQL database connection.
- `ADMIN_API_KEY` environment variable configured.

## Success Criteria

- [ ] Admin server starts on `:3001` and rejects unauthenticated requests.
- [ ] Operators can search players, view Telegram profile info, and view live 50-spin feed.
- [ ] Admin balance adjustments (+N, -N, =N) atomically update player balance and record mandatory audit log.
- [ ] Balance deduction cannot reduce player balance below 0 credits.
- [ ] UI conspicuously displays virtual test credits disclaimer.

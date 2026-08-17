# Design: Admin Dashboard & Live Operations

## Technical Approach

Implement a dedicated administrative operations server listening on an isolated port (`:3001` default) running alongside the player server on `:3000`. Both servers share the PostgreSQL database pool.

The admin surface provides global telemetry, player search, live spin monitoring, and atomic virtual credit adjustments with mandatory audit logging. A bundled single-page console UI is served directly from the admin port with dark-theme ergonomics and non-monetary virtual credit disclaimers.

```text
Operator Browser ──(:3001)──> [Admin Fastify Server] ──> [AdminService] ──┐
                                  │ (API Key / Cookie Auth)                 │
Player Client    ──(:3000)──> [Player Fastify Server] ──> [SpinService]   ──┼──> [PostgreSQL]
                                  │ (Telegram InitData Auth)                │     (players, wallets,
                                                                            │      spin_rounds,
                                                                            │      admin_audit_logs)
```

## Architecture Decisions

| Decision                | Option & Tradeoffs                                          | Choice & Rationale                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server Isolation**    | Integrated `/admin` on `:3000` vs Dual-port (:3000 / :3001) | **Dual-port isolation**: Prevents accidental public exposure via Caddy/reverse-proxy routing errors. Admin port :3001 binds privately or behind internal VPN/firewall.        |
| **Authentication**      | OAuth/JWT vs Pre-shared `ADMIN_API_KEY`                     | **Pre-shared key with Dual Transport**: Accepts `x-admin-api-key` header and `admin_token` HTTP cookie. Validated with `crypto.timingSafeEqual` against timing attacks.       |
| **Balance Adjustments** | Unconstrained updates vs Atomic Transaction with Audit Log  | **Atomic DB Transaction with Row Locks**: Lock wallet `FOR UPDATE`, calculate new balance, enforce `balance >= 0`, insert `admin_audit_logs` record, and commit atomically.   |
| **Admin UI Delivery**   | Separate SSR/Vite dev server vs Embedded static dashboard   | **Embedded static client on :3001**: Single-page dark theme dashboard served via `@fastify/static`, requiring zero additional deployment containers or runtime orchestration. |
| **Player Metadata**     | Separate metadata table vs Enriched `players` columns       | **Enrich `players` table**: Add `username`, `first_name`, and `updated_at`. Seamlessly populated during bootstrap upsert.                                                     |

## Data Flow

```text
[Operator Client] ──(POST /api/admin/players/:id/adjust)──> [Admin Auth Hook]
                                                                  │ (valid API key)
                                                                  ▼
                                                      [AdminService.adjustBalance]
                                                                  │
                                                      ┌───────────┴───────────┐
                                                      │  BEGIN TRANSACTION   │
                                                      │  SELECT FOR UPDATE    │
                                                      │  Check New Balance>=0 │
                                                      │  UPDATE wallets       │
                                                      │  INSERT audit_logs    │
                                                      │  COMMIT               │
                                                      └───────────┬───────────┘
                                                                  ▼
                                                      [200 OK + Updated Balance]
```

## Database Schema (`002_admin_and_metadata.sql`)

```sql
-- 1. Enrich players with Telegram metadata
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);

-- 2. Audit logs for administrative balance adjustments
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('grant', 'deduct', 'set')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  admin_identifier TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_player ON admin_audit_logs(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
```

## File Changes

| File                                             | Action | Description                                                                                                                                    |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/migrations/002_admin_and_metadata.sql` | Create | Migration for player metadata columns and `admin_audit_logs` table.                                                                            |
| `packages/contracts/src/index.ts`                | Modify | Add Zod schemas and DTO types for all admin endpoints and telemetry.                                                                           |
| `apps/api/src/config.ts`                         | Modify | Add `adminPort` (default 3001) and `adminApiKey` configuration fields.                                                                         |
| `apps/api/src/auth/types.ts`                     | Modify | Add `username` and `firstName` to `Identity` type.                                                                                             |
| `apps/api/src/auth/telegram.ts`                  | Modify | Extract `username` and `first_name` from Telegram launch user JSON.                                                                            |
| `apps/api/src/auth/development.ts`               | Modify | Add mock `username` and `first_name` for dev identity.                                                                                         |
| `apps/api/src/db/bootstrap.ts`                   | Modify | Upsert/update `username`, `first_name`, `updated_at` on player bootstrap.                                                                      |
| `apps/api/src/admin/auth.ts`                     | Create | Timing-safe API key verification middleware (header + cookie).                                                                                 |
| `apps/api/src/admin/service.ts`                  | Create | Admin business logic: metrics aggregation, player search, audit adjustment transactions, recent spins query.                                   |
| `apps/api/src/admin/routes/*.ts`                 | Create | Admin route handlers (`/api/admin/metrics`, `/players`, `/spins`, `/auth`).                                                                    |
| `apps/api/src/admin/app.ts`                      | Create | Fastify application factory `buildAdminApp()` with static UI assets on `:3001`.                                                                |
| `apps/api/src/admin/ui/*`                        | Create | Responsive, dark-themed admin dashboard UI (HTML, CSS, JS) with live KPI cards, player search, adjustment modal, spin stream, and disclaimers. |
| `apps/api/src/server.ts`                         | Modify | Dual listener initialization spawning player app on `PORT` and admin app on `ADMIN_PORT`.                                                      |

## Interfaces / Contracts

```typescript
// Core Admin Contracts in @slot-machine/contracts

export const AdminMetricsSchema = z.object({
  totalPlayers: z.number().int().nonnegative(),
  circulatingCredits: z.number().int().nonnegative(),
  totalSpins: z.number().int().nonnegative(),
  observedRtpPercent: z.number().nonnegative(),
});

export const AdminPlayerSchema = z.object({
  id: z.string().uuid(),
  authProvider: z.string(),
  providerSubject: z.string(),
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  balance: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AdminAdjustBalanceSchema = z.object({
  action: z.enum(["grant", "deduct", "set"]),
  amount: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500),
});

export const AdminSpinFeedItemSchema = z.object({
  roundId: z.string().uuid(),
  playerId: z.string().uuid(),
  username: z.string().nullable(),
  stake: z.number().int().positive(),
  payout: z.number().int().nonnegative(),
  symbols: SlotSymbolsSchema,
  balanceBefore: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
```

## Testing Strategy

| Layer           | What to Test                                             | Approach                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**        | Zod schemas, adjustment math, timing-safe key comparison | Vitest test suites verifying payload parsing, boundary clamping, and auth helper.                                                                                                                                                                           |
| **Integration** | Fastify admin injection & DB transactions                | Test `buildAdminApp()`: 401 unauthenticated, metric aggregation accuracy, search filter query, atomic adjustment (grant/deduct/set), deduction exceeding balance rejection (400), blank reason rejection (400), and `admin_audit_logs` record verification. |
| **E2E / Smoke** | Admin UI rendering & flows                               | Playwright test validating login, KPI cards, player search, balance adjustment modal flow, and live spin feed rendering.                                                                                                                                    |

## Threat Matrix

| Threat Category                    | Applicability | Safe / Failure Behavior                                                                                           | Planned RED Test                                                                              |
| ---------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Unauthorized Admin Access**      | Applicable    | Reject missing/invalid `ADMIN_API_KEY` with 401. Constant-time comparison prevents timing attacks.                | `test/admin/auth.test.ts` rejects invalid tokens and timing attacks.                          |
| **Negative Balance Race**          | Applicable    | Row lock `wallets FOR UPDATE` inside transaction. Reject deduct if `balance < amount` with 400.                   | `test/admin/adjust.test.ts` concurrent deduct attempt rejects overdraw.                       |
| **Audit Log Tampering / Omission** | Applicable    | Adjustments and audit log writes occur in the same atomic transaction. `reason` column enforces non-empty string. | `test/admin/audit.test.ts` fails adjustment if audit insertion fails or reason is whitespace. |
| **Network Port Exposure**          | Applicable    | Admin server on `:3001` operates completely detached from public player routes on `:3000`.                        | `test/admin/isolation.test.ts` asserts admin routes 404 on player port.                       |

## Migration / Rollout

Apply migration `002_admin_and_metadata.sql` during deployment. All new columns on `players` are nullable or have defaults to guarantee zero downtime for active player sessions. Set `ADMIN_API_KEY` in environment secrets.

## Open Questions

None. Architecture and requirements are fully specified.

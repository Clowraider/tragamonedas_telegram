# Tasks: Admin Dashboard & Live Operations

## Review Workload Forecast

| Field                   | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| Estimated changed lines | 380-480 lines                                                    |
| 400-line budget risk    | High                                                             |
| Chained PRs recommended | Yes                                                              |
| Suggested split         | PR 1 (Backend: DB, Auth & Admin API) → PR 2 (Dashboard UI & E2E) |
| Delivery strategy       | ask-on-risk                                                      |
| Chain strategy          | pending                                                          |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                       | Likely PR | Focused test command                               | Runtime harness                             | Rollback boundary                                    |
| ---- | ---------------------------------------------------------- | --------- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| 1    | DB schema, contracts, admin auth & core balance adjustment | PR 1      | `pnpm --filter @slot-machine/api test test/admin/` | `ADMIN_API_KEY=test pnpm start:admin`       | Migration `002` + `src/admin/{auth,service,routes}`  |
| 2    | Embedded HTML/SPA dashboard UI & Playwright smoke flows    | PR 2      | `pnpm test:e2e test/admin-ui.spec.ts`              | Browser navigate to `http://localhost:3001` | `apps/api/src/admin/ui/` + static route registration |

## Phase 1: Persistence & Contracts

- [x] 1.1 Create migration `apps/api/migrations/002_admin_and_metadata.sql` adding `username`, `first_name`, `updated_at` to `players` and creating `admin_audit_logs`.
- [x] 1.2 Add Admin schemas and DTOs in `packages/contracts/src/index.ts` (`AdminMetricsSchema`, `AdminPlayerSchema`, `AdminAdjustBalanceSchema`, `AdminSpinFeedItemSchema`).
- [x] 1.3 Update player bootstrap in `apps/api/src/db/bootstrap.ts` and auth types in `apps/api/src/auth/` to capture Telegram `username` and `first_name`.

## Phase 2: Core Admin Services & Auth

- [x] 2.1 [RED Test] Add `apps/api/test/admin/auth.test.ts` testing missing key, invalid key rejection (401), and timing-safe header/cookie comparison.
- [x] 2.2 Implement timing-safe API key auth hook in `apps/api/src/admin/auth.ts` and config updates in `apps/api/src/config.ts`.
- [x] 2.3 [RED Test] Add `apps/api/test/admin/adjust.test.ts` and `apps/api/test/admin/audit.test.ts` for atomic adjustments, negative balance rejection, and whitespace reason rejection.
- [x] 2.4 Implement `AdminService` in `apps/api/src/admin/service.ts` with row locking (`wallets FOR UPDATE`), metrics aggregation, player search, and audit logging.

## Phase 3: Fastify Admin API Server on :3001

- [x] 3.1 [RED Test] Add `apps/api/test/admin/isolation.test.ts` verifying admin routes return 404 on player port `:3000`.
- [x] 3.2 Implement admin REST routes in `apps/api/src/admin/routes/` for `/admin/metrics`, `/admin/players`, `/admin/players/:id/adjust`, `/admin/spins/recent`, and `/admin/audit-logs`.
- [x] 3.3 Create `buildAdminApp()` in `apps/api/src/admin/app.ts` and dual listener startup in `apps/api/src/server.ts`.

## Phase 4: Admin Dashboard UI

- [x] 4.1 Create dark-theme HTML/CSS/JS dashboard in `apps/api/src/admin/ui/` with prominent non-monetary virtual test credit disclaimer.
- [x] 4.2 Implement KPI overview cards, player search table, balance adjustment modal, and live 50-spin feed in UI.
- [x] 4.3 Configure `@fastify/static` plugin in `apps/api/src/admin/app.ts` to serve dashboard UI on `:3001`.

## Phase 5: Verification & Integration

- [x] 5.1 Run unit and integration test suites: `pnpm --filter @slot-machine/api test test/admin/`.
- [x] 5.2 Add and run E2E verification test for complete admin workflow (login, view metrics, search player, adjust balance, inspect live spin feed).
- [x] 5.3 Verify dual server startup (`:3000` player app, `:3001` admin dashboard) and document operational instructions.

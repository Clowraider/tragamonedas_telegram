import { describe, expect, it } from "vitest";
import { buildAdminApp } from "../../src/admin/app.js";
import { loadConfig } from "../../src/config.js";
import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { createSpin } from "../../src/spins/spin.service.js";
import { withTestSchema } from "../db/helpers.js";

describe("Admin Fastify API Server & Dashboard Endpoints", () => {
  it("serves static dashboard HTML on root path with compliance disclaimer", async () => {
    await withTestSchema(async (pool) => {
      const config = loadConfig({
        ...process.env,
        AUTH_MODE: "development",
        ADMIN_API_KEY: "test-admin-secret-key-123",
      });

      const app = await buildAdminApp({ config, pool });

      const res = await app.inject({
        method: "GET",
        url: "/",
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("COMPLIANCE DISCLAIMER");
      expect(res.body).toMatch(/non-monetary\s+virtual\s+test\s+credits/);
      expect(res.body).toContain("Slot Machine Ops Console");

      await app.close();
    });
  });

  it("handles complete admin workflow: metrics, player search, balance adjustment, and live feed", async () => {
    await withTestSchema(async (pool) => {
      const config = loadConfig({
        ...process.env,
        AUTH_MODE: "development",
        ADMIN_API_KEY: "test-admin-secret-key-123",
      });

      const app = await buildAdminApp({ config, pool });
      const authHeaders = { "x-admin-api-key": "test-admin-secret-key-123" };

      // 1. Create two test players
      const player1 = await bootstrapPlayer(
        pool,
        {
          provider: "telegram",
          providerSubject: "998877",
          displayLabel: "telegram",
          username: "high_roller",
          firstName: "Roller",
        },
        1000,
      );

      const player2 = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "dev-player-2",
          displayLabel: "dev",
          username: "tester_two",
          firstName: "Tester",
        },
        500,
      );

      // Settle a spin round for player1
      await createSpin({
        pool,
        playerId: player1.playerId,
        idempotencyKey: "5a9f3848-154f-4e8c-8eb4-e3c9ea3b5591",
        terms: { stake: 10, gameVersion: "classic-1" },
        configuredStake: 10,
        random: { nextInt: () => 0 },
      });

      // 2. Query Metrics
      const metricsRes = await app.inject({
        method: "GET",
        url: "/api/admin/metrics",
        headers: authHeaders,
      });
      expect(metricsRes.statusCode).toBe(200);
      const metrics = metricsRes.json();
      expect(metrics.totalPlayers).toBe(2);
      expect(metrics.totalSpins).toBe(1);
      expect(metrics.circulatingCredits).toBeGreaterThan(0);

      // 3. Search Players
      const searchRes = await app.inject({
        method: "GET",
        url: "/api/admin/players?search=high_roller",
        headers: authHeaders,
      });
      expect(searchRes.statusCode).toBe(200);
      const searchData = searchRes.json();
      expect(searchData.total).toBe(1);
      expect(searchData.players[0].username).toBe("high_roller");
      expect(searchData.players[0].stats).toBeDefined();
      expect(searchData.players[0].stats.totalSpins).toBe(1);
      expect(searchData.players[0].stats.biggestWinAmount).toBe(30);

      // 4. Adjust Balance (grant +500)
      const grantRes = await app.inject({
        method: "POST",
        url: `/api/admin/players/${player2.playerId}/adjust`,
        headers: authHeaders,
        payload: {
          action: "grant",
          amount: 500,
          reason: "Tournament participation bonus",
        },
      });
      expect(grantRes.statusCode).toBe(200);
      const grantData = grantRes.json();
      expect(grantData.balanceBefore).toBe(500);
      expect(grantData.balanceAfter).toBe(1000);

      // 5. Adjust Balance (deduct with insufficient funds -> 400)
      const failDeductRes = await app.inject({
        method: "POST",
        url: `/api/admin/players/${player2.playerId}/adjust`,
        headers: authHeaders,
        payload: {
          action: "deduct",
          amount: 9999,
          reason: "Invalid overdraw attempt",
        },
      });
      expect(failDeductRes.statusCode).toBe(400);

      // 6. Inspect Live Spin Feed
      const spinsRes = await app.inject({
        method: "GET",
        url: "/api/admin/spins/recent",
        headers: authHeaders,
      });
      expect(spinsRes.statusCode).toBe(200);
      const spinsData = spinsRes.json();
      expect(spinsData.items.length).toBe(1);
      expect(spinsData.items[0].username).toBe("high_roller");

      // 7. Inspect Audit Logs
      const auditRes = await app.inject({
        method: "GET",
        url: "/api/admin/audit-logs",
        headers: authHeaders,
      });
      expect(auditRes.statusCode).toBe(200);
      const auditData = auditRes.json();
      expect(auditData.items.length).toBe(1);
      expect(auditData.items[0].reason).toBe("Tournament participation bonus");

      await app.close();
    });
  });
});

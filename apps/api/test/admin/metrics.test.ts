import { describe, expect, it } from "vitest";
import { AdminService } from "../../src/admin/service.js";
import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { createSpin } from "../../src/spins/spin.service.js";
import { withTestSchema } from "../db/helpers.js";

describe("Admin Metrics Aggregation", () => {
  it("returns zeroed metrics on fresh database", async () => {
    await withTestSchema(async (pool) => {
      const service = new AdminService(pool);
      const metrics = await service.getMetrics();

      expect(metrics.totalPlayers).toBe(0);
      expect(metrics.circulatingCredits).toBe(0);
      expect(metrics.totalSpins).toBe(0);
      expect(metrics.totalWagered).toBe(0);
      expect(metrics.totalPaidOut).toBe(0);
      expect(metrics.grossGamingRevenue).toBe(0);
      expect(metrics.winningSpinsCount).toBe(0);
      expect(metrics.globalWinRatePercent).toBe(0);
      expect(metrics.observedRtpPercent).toBe(0);
    });
  });

  it("calculates accurate observed RTP across winning and losing spins", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "rtp-test-player",
          displayLabel: "dev",
        },
        1000,
      );

      // Spin 1: stake 10, payout 0 (stops [0, 1, 2] -> cherry, lemon, bell -> payout 0)
      await createSpin({
        pool,
        playerId: player.playerId,
        idempotencyKey: "11111111-1111-1111-1111-111111111111",
        terms: { stake: 10, gameVersion: "classic-1" },
        configuredStake: 10,
        random: {
          stops: [0, 1, 2],
          nextInt() {
            return this.stops.shift() ?? 0;
          },
        },
      });

      // Spin 2: stake 10, payout 30 (stops [0, 0, 0] -> cherry, cherry, cherry -> multiplier 3 -> payout 30)
      await createSpin({
        pool,
        playerId: player.playerId,
        idempotencyKey: "22222222-2222-2222-2222-222222222222",
        terms: { stake: 10, gameVersion: "classic-1" },
        configuredStake: 10,
        random: {
          stops: [0, 0, 0],
          nextInt() {
            return this.stops.shift() ?? 0;
          },
        },
      });

      const service = new AdminService(pool);
      const metrics = await service.getMetrics();

      expect(metrics.totalPlayers).toBe(1);
      expect(metrics.totalSpins).toBe(2);
      expect(metrics.totalWagered).toBe(20);
      expect(metrics.totalPaidOut).toBe(30);
      expect(metrics.grossGamingRevenue).toBe(-10); // 20 - 30
      expect(metrics.winningSpinsCount).toBe(1);
      expect(metrics.globalWinRatePercent).toBe(50); // 1 out of 2 = 50%
      // Total stake = 20, Total payout = 30 -> RTP = 30 / 20 * 100 = 150%
      expect(metrics.observedRtpPercent).toBe(150);
    });
  });
});

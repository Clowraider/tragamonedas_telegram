import { describe, expect, it } from "vitest";
import { AdminService, AdminServiceError } from "../../src/admin/service.js";
import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { withTestSchema } from "../db/helpers.js";

describe("Admin Balance Adjustments", () => {
  it("grants credits (+N) to a player", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-grant",
          displayLabel: "dev",
        },
        1000,
      );

      const service = new AdminService(pool);
      const res = await service.adjustBalance(
        player.playerId,
        {
          action: "grant",
          amount: 500,
          reason: "Bonus reward",
        },
        "admin-1",
      );

      expect(res.balanceBefore).toBe(1000);
      expect(res.balanceAfter).toBe(1500);

      const client = await pool.connect();
      const wallet = await client.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE player_id = $1",
        [player.playerId],
      );
      client.release();
      expect(wallet.rows[0]?.balance).toBe(1500);
    });
  });

  it("deducts credits (-N) when sufficient balance exists", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-deduct",
          displayLabel: "dev",
        },
        1000,
      );

      const service = new AdminService(pool);
      const res = await service.adjustBalance(
        player.playerId,
        {
          action: "deduct",
          amount: 400,
          reason: "Adjustment correction",
        },
        "admin-1",
      );

      expect(res.balanceBefore).toBe(1000);
      expect(res.balanceAfter).toBe(600);
    });
  });

  it("rejects deduction exceeding player balance and leaves balance untouched", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-overdraw",
          displayLabel: "dev",
        },
        200,
      );

      const service = new AdminService(pool);
      await expect(
        service.adjustBalance(
          player.playerId,
          {
            action: "deduct",
            amount: 500,
            reason: "Overdraft attempt",
          },
          "admin-1",
        ),
      ).rejects.toThrowError(AdminServiceError);

      const client = await pool.connect();
      const wallet = await client.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE player_id = $1",
        [player.playerId],
      );
      client.release();
      expect(wallet.rows[0]?.balance).toBe(200);
    });
  });

  it("sets absolute balance (=N) accurately", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-set",
          displayLabel: "dev",
        },
        500,
      );

      const service = new AdminService(pool);
      const res = await service.adjustBalance(
        player.playerId,
        {
          action: "set",
          amount: 2500,
          reason: "QA balance override",
        },
        "admin-ops",
      );

      expect(res.balanceBefore).toBe(500);
      expect(res.balanceAfter).toBe(2500);
    });
  });
});

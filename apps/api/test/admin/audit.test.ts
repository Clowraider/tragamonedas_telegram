import { describe, expect, it } from "vitest";
import { AdminService, AdminServiceError } from "../../src/admin/service.js";
import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { withTestSchema } from "../db/helpers.js";

describe("Admin Audit Logging", () => {
  it("rejects adjustments with empty or whitespace-only reason", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-audit-blank",
          displayLabel: "dev",
        },
        1000,
      );

      const service = new AdminService(pool);

      await expect(
        service.adjustBalance(
          player.playerId,
          {
            action: "grant",
            amount: 100,
            reason: "",
          },
          "admin-1",
        ),
      ).rejects.toThrowError(AdminServiceError);

      await expect(
        service.adjustBalance(
          player.playerId,
          {
            action: "grant",
            amount: 100,
            reason: "   ",
          },
          "admin-1",
        ),
      ).rejects.toThrowError(AdminServiceError);

      // Verify no audit log exists
      const logs = await service.listAuditLogs({ playerId: player.playerId });
      expect(logs).toHaveLength(0);
    });
  });

  it("records immutable audit log on successful adjustment", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "player-audit-success",
          displayLabel: "dev",
          username: "alice_slot",
        },
        1000,
      );

      const service = new AdminService(pool);
      const res = await service.adjustBalance(
        player.playerId,
        {
          action: "grant",
          amount: 500,
          reason: "Promotion reward round 1",
        },
        "admin-super",
      );

      const logs = await service.listAuditLogs({ playerId: player.playerId });
      expect(logs).toHaveLength(1);
      const log = logs[0]!;
      expect(log.id).toBe(res.auditLogId);
      expect(log.playerId).toBe(player.playerId);
      expect(log.username).toBe("alice_slot");
      expect(log.actionType).toBe("grant");
      expect(log.amount).toBe(500);
      expect(log.balanceBefore).toBe(1000);
      expect(log.balanceAfter).toBe(1500);
      expect(log.reason).toBe("Promotion reward round 1");
      expect(log.adminIdentifier).toBe("admin-super");
    });
  });
});

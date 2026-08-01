import { describe, expect, it } from "vitest";

import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { withTestSchema } from "../db/helpers.js";

describe("Provider isolation", () => {
  it("keeps telegram and development subjects separate", async () => {
    await withTestSchema(async (pool) => {
      const devIdentity = {
        provider: "development" as const,
        providerSubject: "123",
        displayLabel: "development",
      };
      const telegramIdentity = {
        provider: "telegram" as const,
        providerSubject: "123",
        displayLabel: "telegram",
      };
      const dev = await bootstrapPlayer(pool, devIdentity, 1000);
      const telegram = await bootstrapPlayer(pool, telegramIdentity, 1000);
      expect(dev.playerId).not.toBe(telegram.playerId);
    });
  });
});

import { describe, expect, it } from "vitest";

import * as bootstrapModule from "../../src/db/bootstrap.js";
import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { withTestSchema } from "../db/helpers.js";

describe("Virtual credits have no cash value", () => {
  it("exposes only integer balances and no value-bearing operations", async () => {
    await withTestSchema(async (pool) => {
      const result = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "local-dev",
          displayLabel: "development",
        },
        1000,
      );
      expect(Number.isInteger(result.balance)).toBe(true);
      expect(result.balance).toBeGreaterThan(0);
    });
  });

  it("does not expose purchase, transfer, redemption, or withdrawal operations", () => {
    const exportedNames = Object.keys(bootstrapModule);
    expect(exportedNames).toEqual(["bootstrapPlayer"]);
    for (const name of exportedNames) {
      expect(name).not.toMatch(/purchase|transfer|redeem|withdraw|deposit/i);
    }
  });
});

import { describe, expect, it } from "vitest";

import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { withTestSchema } from "../db/helpers.js";

describe("Virtual wallet bootstrap", () => {
  it("gives a new player the configured starting balance", async () => {
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
      expect(result.balance).toBe(1000);
      expect(result.authProvider).toBe("development");
      expect(result.providerSubject).toBe("local-dev");
    });
  });

  it("returns the same player without resetting balance", async () => {
    await withTestSchema(async (pool) => {
      const identity = {
        provider: "development" as const,
        providerSubject: "local-dev",
        displayLabel: "development",
      };
      const first = await bootstrapPlayer(pool, identity, 1000);
      const second = await bootstrapPlayer(pool, identity, 1000);
      expect(second.playerId).toBe(first.playerId);
      expect(second.balance).toBe(1000);
    });
  });

  it("preserves a changed balance across repeated bootstrap", async () => {
    await withTestSchema(async (pool) => {
      const identity = {
        provider: "development" as const,
        providerSubject: "local-dev",
        displayLabel: "development",
      };
      const first = await bootstrapPlayer(pool, identity, 1000);
      const client = await pool.connect();
      await client.query(
        "UPDATE wallets SET balance = 500 WHERE player_id = $1",
        [first.playerId],
      );
      client.release();
      const second = await bootstrapPlayer(pool, identity, 1000);
      expect(second.balance).toBe(500);
    });
  });

  it("captures and updates Telegram profile metadata on bootstrap", async () => {
    await withTestSchema(async (pool) => {
      const initialIdentity = {
        provider: "telegram" as const,
        providerSubject: "12345678",
        displayLabel: "telegram",
        username: "initial_user",
        firstName: "Initial",
      };
      const first = await bootstrapPlayer(pool, initialIdentity, 1000);
      expect(first.username).toBe("initial_user");
      expect(first.firstName).toBe("Initial");

      const updatedIdentity = {
        provider: "telegram" as const,
        providerSubject: "12345678",
        displayLabel: "telegram",
        username: "updated_user",
        firstName: "Updated",
      };
      const second = await bootstrapPlayer(pool, updatedIdentity, 1000);
      expect(second.playerId).toBe(first.playerId);
      expect(second.username).toBe("updated_user");
      expect(second.firstName).toBe("Updated");

      const client = await pool.connect();
      const dbRow = await client.query<{
        username: string;
        first_name: string;
      }>("SELECT username, first_name FROM players WHERE id = $1", [
        first.playerId,
      ]);
      client.release();
      expect(dbRow.rows[0]?.username).toBe("updated_user");
      expect(dbRow.rows[0]?.first_name).toBe("Updated");
    });
  });
});

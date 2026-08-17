import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import pg from "pg";

import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { GAME_VERSION } from "../../src/game/config.js";
import type { RandomSource } from "../../src/game/random.js";
import {
  GAME_VERSION_MISMATCH,
  IDEMPOTENCY_CONFLICT,
  INSUFFICIENT_CREDITS,
  SpinError,
  createSpin,
} from "../../src/spins/spin.service.js";
import { withTestSchema } from "../db/helpers.js";

class FixedRandomSource implements RandomSource {
  constructor(private readonly values: number[]) {}
  nextInt(bound: number): number {
    const value = this.values.shift();
    if (value === undefined) {
      throw new Error("FixedRandomSource exhausted");
    }
    if (value < 0 || value >= bound) {
      throw new Error(`FixedRandomSource value out of range: ${value}`);
    }
    return value;
  }
}

const IDENTITY = {
  provider: "development" as const,
  providerSubject: "spin-test-player",
  displayLabel: "development",
};

async function bootstrap(pool: pg.Pool, balance = 1000) {
  return bootstrapPlayer(pool, IDENTITY, balance);
}

describe("spin service settlement", () => {
  it("settles one atomic round with fixed stake and matching before/after balance", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool);
      const key = randomUUID();
      const result = await createSpin({
        playerId: player.playerId,
        idempotencyKey: key,
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([4, 4, 4]),
        pool,
      });
      expect(result.replayed).toBe(false);
      expect(result.representation.status).toBe("settled");
      expect(result.representation.symbols).toEqual([
        "seven",
        "seven",
        "seven",
      ]);
      expect(result.representation.stake).toBe(10);
      expect(result.representation.payout).toBe(500);
      expect(result.representation.balanceBefore).toBe(1000);
      expect(result.representation.balanceAfter).toBe(1000 - 10 + 500);
    });
  });

  it("rejects a non-winning outcome with zero payout and stake deduction", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool);
      const result = await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([0, 2, 4]),
        pool,
      });
      expect(result.representation.payout).toBe(0);
      expect(result.representation.balanceAfter).toBe(990);
    });
  });

  it("rejects an insufficient balance with no round or balance change", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool, 5);
      await expect(
        createSpin({
          playerId: player.playerId,
          idempotencyKey: randomUUID(),
          terms: { stake: 10, gameVersion: GAME_VERSION },
          configuredStake: 10,
          random: new FixedRandomSource([0, 0, 0]),
          pool,
        }),
      ).rejects.toMatchObject({ code: INSUFFICIENT_CREDITS });
      const wallet = await pool.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE player_id = $1",
        [player.playerId],
      );
      expect(wallet.rows[0]?.balance).toBe(5);
      const rounds = await pool.query(
        "SELECT count(*)::int AS n FROM spin_rounds WHERE player_id = $1",
        [player.playerId],
      );
      expect(rounds.rows[0]?.n).toBe(0);
    });
  });

  it("rejects a client-supplied alternative stake or game version", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool);
      await expect(
        createSpin({
          playerId: player.playerId,
          idempotencyKey: randomUUID(),
          terms: { stake: 50, gameVersion: GAME_VERSION },
          configuredStake: 10,
          random: new FixedRandomSource([0, 0, 0]),
          pool,
        }),
      ).rejects.toMatchObject({ code: GAME_VERSION_MISMATCH });
      await expect(
        createSpin({
          playerId: player.playerId,
          idempotencyKey: randomUUID(),
          terms: { stake: 10, gameVersion: "classic-999" },
          configuredStake: 10,
          random: new FixedRandomSource([0, 0, 0]),
          pool,
        }),
      ).rejects.toMatchObject({ code: GAME_VERSION_MISMATCH });
    });
  });

  it("rolls back atomically when settlement fails before commit", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool, 5);
      const key = randomUUID();
      await expect(
        createSpin({
          playerId: player.playerId,
          idempotencyKey: key,
          terms: { stake: 10, gameVersion: GAME_VERSION },
          configuredStake: 10,
          random: new FixedRandomSource([0, 0, 0]),
          pool,
        }),
      ).rejects.toBeInstanceOf(SpinError);
      const wallet = await pool.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE player_id = $1",
        [player.playerId],
      );
      expect(wallet.rows[0]?.balance).toBe(5);
      const rounds = await pool.query(
        "SELECT count(*)::int AS n FROM spin_rounds WHERE player_id = $1",
        [player.playerId],
      );
      expect(rounds.rows[0]?.n).toBe(0);
    });
  });
});

describe("spin idempotency", () => {
  it("returns the original round on an identical retry without another outcome", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool);
      const key = randomUUID();
      const terms = { stake: 10, gameVersion: GAME_VERSION };
      const first = await createSpin({
        playerId: player.playerId,
        idempotencyKey: key,
        terms,
        configuredStake: 10,
        random: new FixedRandomSource([4, 4, 4]),
        pool,
      });
      const second = await createSpin({
        playerId: player.playerId,
        idempotencyKey: key,
        terms,
        configuredStake: 10,
        random: new FixedRandomSource([0, 0, 0]),
        pool,
      });
      expect(second.replayed).toBe(true);
      expect(second.representation).toEqual(first.representation);
      const rounds = await pool.query(
        "SELECT count(*)::int AS n FROM spin_rounds WHERE player_id = $1",
        [player.playerId],
      );
      expect(rounds.rows[0]?.n).toBe(1);
    });
  });

  it("rejects a conflicting retry without a new round or balance change", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrap(pool);
      const key = randomUUID();
      await createSpin({
        playerId: player.playerId,
        idempotencyKey: key,
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([4, 4, 4]),
        pool,
      });
      await expect(
        createSpin({
          playerId: player.playerId,
          idempotencyKey: key,
          terms: { stake: 50, gameVersion: GAME_VERSION },
          configuredStake: 10,
          random: new FixedRandomSource([0, 0, 0]),
          pool,
        }),
      ).rejects.toMatchObject({ code: IDEMPOTENCY_CONFLICT });
      const rounds = await pool.query(
        "SELECT count(*)::int AS n FROM spin_rounds WHERE player_id = $1",
        [player.playerId],
      );
      expect(rounds.rows[0]?.n).toBe(1);
    });
  });
});

describe("concurrent spins cannot overspend", () => {
  it("settles at most one when balance funds only one spin", async () => {
    await withTestSchema(
      async (pool) => {
        const player = await bootstrap(pool, 15);
        const keyA = randomUUID();
        const keyB = randomUUID();
        const [a, b] = await Promise.allSettled([
          createSpin({
            playerId: player.playerId,
            idempotencyKey: keyA,
            terms: { stake: 10, gameVersion: GAME_VERSION },
            configuredStake: 10,
            random: new FixedRandomSource([0, 2, 4]),
            pool,
          }),
          createSpin({
            playerId: player.playerId,
            idempotencyKey: keyB,
            terms: { stake: 10, gameVersion: GAME_VERSION },
            configuredStake: 10,
            random: new FixedRandomSource([0, 2, 4]),
            pool,
          }),
        ]);
        const settled = [a, b].filter((r) => r.status === "fulfilled");
        const rejected = [a, b].filter((r) => r.status === "rejected");
        expect(settled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        if (rejected[0]?.status === "rejected") {
          expect(rejected[0].reason).toMatchObject({
            code: INSUFFICIENT_CREDITS,
          });
        }
        const wallet = await pool.query<{ balance: number }>(
          "SELECT balance FROM wallets WHERE player_id = $1",
          [player.playerId],
        );
        expect(wallet.rows[0]!.balance).toBeGreaterThanOrEqual(0);
        const rounds = await pool.query(
          "SELECT count(*)::int AS n FROM spin_rounds WHERE player_id = $1",
          [player.playerId],
        );
        expect(rounds.rows[0]?.n).toBe(1);
      },
      { poolMax: 3 },
    );
  });
});

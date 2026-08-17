import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { bootstrapPlayer } from "../../src/db/bootstrap.js";
import { GAME_VERSION } from "../../src/game/config.js";
import type { RandomSource } from "../../src/game/random.js";
import {
  ROUND_NOT_FOUND,
  SpinError,
  createSpin,
  getRound,
  listRounds,
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

describe("round recovery and history", () => {
  it("recovers the authoritative recorded round for the owner", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-player-a",
          displayLabel: "development",
        },
        1000,
      );
      const round = await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([4, 4, 4]),
        pool,
      });
      const recovered = await getRound(
        pool,
        player.playerId,
        round.representation.roundId,
      );
      expect(recovered).toEqual(round.representation);
    });
  });

  it("refuses recovery of another player's round", async () => {
    await withTestSchema(async (pool) => {
      const owner = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-owner",
          displayLabel: "development",
        },
        1000,
      );
      const stranger = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-stranger",
          displayLabel: "development",
        },
        1000,
      );
      const round = await createSpin({
        playerId: owner.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([4, 4, 4]),
        pool,
      });
      await expect(
        getRound(pool, stranger.playerId, round.representation.roundId),
      ).rejects.toBeInstanceOf(SpinError);
      await expect(
        getRound(pool, stranger.playerId, round.representation.roundId),
      ).rejects.toMatchObject({ code: ROUND_NOT_FOUND });
    });
  });

  it("lists a bounded newest-first history containing only the player's rounds", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-player-b",
          displayLabel: "development",
        },
        1000,
      );
      const other = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-player-c",
          displayLabel: "development",
        },
        1000,
      );

      await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([0, 0, 0]),
        pool,
      });
      await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([1, 1, 1]),
        pool,
      });
      const otherRound = await createSpin({
        playerId: other.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([2, 2, 2]),
        pool,
      });

      const history = await listRounds(pool, player.playerId, 20);
      expect(history.items).toHaveLength(2);
      expect(history.nextCursor).toBeNull();
      for (const item of history.items) {
        expect(item.roundId).not.toBe(otherRound.representation.roundId);
      }
      expect(history.items[0]!.symbols).toEqual(["lemon", "lemon", "lemon"]);
      expect(history.items[1]!.symbols).toEqual(["cherry", "cherry", "cherry"]);
    });
  });

  it("supports cursor pagination across the bounded history", async () => {
    await withTestSchema(async (pool) => {
      const player = await bootstrapPlayer(
        pool,
        {
          provider: "development",
          providerSubject: "history-player-d",
          displayLabel: "development",
        },
        1000,
      );
      const first = await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([0, 0, 0]),
        pool,
      });
      const second = await createSpin({
        playerId: player.playerId,
        idempotencyKey: randomUUID(),
        terms: { stake: 10, gameVersion: GAME_VERSION },
        configuredStake: 10,
        random: new FixedRandomSource([1, 1, 1]),
        pool,
      });

      const page1 = await listRounds(pool, player.playerId, 1);
      expect(page1.items).toHaveLength(1);
      expect(page1.items[0]!.roundId).toBe(second.representation.roundId);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await listRounds(
        pool,
        player.playerId,
        1,
        page1.nextCursor ?? undefined,
      );
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]!.roundId).toBe(first.representation.roundId);
      expect(page2.nextCursor).toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";

import { GAME_VERSION, REEL_SIZE } from "../../src/game/config.js";
import {
  InvalidReelStopError,
  UnsupportedGameVersionError,
  evaluatePayout,
  generateOutcome,
  type ReelSymbols,
} from "../../src/game/engine.js";
import type { RandomSource } from "../../src/game/random.js";

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

const symbols: ReelSymbols = ["seven", "seven", "seven"];

describe("game engine", () => {
  it("accepts a valid spin with exactly three central-line symbols", () => {
    const random = new FixedRandomSource([0, 1, 2]);
    const outcome = generateOutcome(random);
    expect(outcome.stops).toHaveLength(REEL_SIZE);
    expect(outcome.symbols).toHaveLength(REEL_SIZE);
    expect(outcome.symbols).toEqual(["cherry", "lemon", "bell"]);
  });

  it("evaluates a winning outcome against the versioned rule", () => {
    expect(evaluatePayout(symbols, GAME_VERSION, 10)).toBe(500);
    expect(evaluatePayout(["cherry", "cherry", "cherry"], GAME_VERSION, 10)).toBe(
      30,
    );
  });

  it("evaluates a non-winning outcome as zero", () => {
    expect(
      evaluatePayout(["cherry", "seven", "bell"], GAME_VERSION, 10),
    ).toBe(0);
  });

  it("rejects an unsupported game version", () => {
    expect(() => evaluatePayout(symbols, "classic-999", 10)).toThrow(
      UnsupportedGameVersionError,
    );
  });

  it("rejects out-of-range reel stops", () => {
    const outOfRange: RandomSource = {
      nextInt(bound: number): number {
        return bound + 94;
      },
    };
    expect(() => generateOutcome(outOfRange)).toThrow(InvalidReelStopError);
  });
});

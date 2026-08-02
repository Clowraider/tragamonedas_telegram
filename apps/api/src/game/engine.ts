import type { SlotSymbol } from "@slot-machine/contracts";

import {
  PAYOUT_MULTIPLIERS,
  REEL_SIZE,
  REEL_SYMBOLS,
  SYMBOL_COUNT,
  isSupportedGameVersion,
} from "./config.js";
import type { RandomSource } from "./random.js";

export type ReelStops = readonly [number, number, number];
export type ReelSymbols = readonly [SlotSymbol, SlotSymbol, SlotSymbol];

export class UnsupportedGameVersionError extends Error {
  constructor(readonly version: string) {
    super(`Unsupported game version: ${version}`);
    this.name = "UnsupportedGameVersionError";
  }
}

export class InvalidReelStopError extends Error {
  constructor(readonly stop: number) {
    super(`Reel stop out of range: ${stop}`);
    this.name = "InvalidReelStopError";
  }
}

function symbolAt(stop: number): SlotSymbol {
  if (!Number.isInteger(stop) || stop < 0 || stop >= SYMBOL_COUNT) {
    throw new InvalidReelStopError(stop);
  }
  const symbol = REEL_SYMBOLS[stop];
  if (symbol === undefined) {
    throw new InvalidReelStopError(stop);
  }
  return symbol;
}

/**
 * Generates three stops using the injected random source and maps them to
 * authoritative symbols. Pure with respect to the random source seam.
 */
export function generateOutcome(random: RandomSource): {
  stops: ReelStops;
  symbols: ReelSymbols;
} {
  const stops: number[] = [];
  const symbols: SlotSymbol[] = [];
  for (let i = 0; i < REEL_SIZE; i += 1) {
    const stop = random.nextInt(SYMBOL_COUNT);
    stops.push(stop);
    symbols.push(symbolAt(stop));
  }
  return {
    stops: stops as unknown as ReelStops,
    symbols: symbols as unknown as ReelSymbols,
  };
}

/**
 * Evaluates the payout for a settled outcome under a specific game
 * version. Rejects versions this build does not serve so a round can
 * never be settled under unknown rules.
 */
export function evaluatePayout(
  symbols: ReelSymbols,
  gameVersion: string,
  stake: number,
): number {
  if (!isSupportedGameVersion(gameVersion)) {
    throw new UnsupportedGameVersionError(gameVersion);
  }
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const multiplier = PAYOUT_MULTIPLIERS[symbols[0]];
    if (multiplier !== undefined) {
      return stake * multiplier;
    }
  }
  return 0;
}

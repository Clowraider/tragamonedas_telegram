import type { SlotSymbol } from "@slot-machine/contracts";

export const GAME_VERSION = "classic-1";
export const REEL_SIZE = 3;
export const SYMBOL_COUNT = 5;

/**
 * Immutable code-owned reel layout. The reel is a uniform list of symbols;
 * a stop index selects one symbol. Game rules are versioned so settled
 * rounds remain auditable even if later versions change payouts.
 */
export const REEL_SYMBOLS: readonly SlotSymbol[] = [
  "cherry",
  "lemon",
  "bell",
  "bar",
  "seven",
] as const;

/**
 * Payout multipliers keyed by the symbol appearing on all three reels
 * (the single central payline). A non-matching combination pays zero.
 * The stake is applied as the multiplier base so every rule is stable
 * and reviewable.
 */
export const PAYOUT_MULTIPLIERS: Readonly<Record<SlotSymbol, number>> = {
  cherry: 3,
  lemon: 5,
  bell: 10,
  bar: 20,
  seven: 50,
};

export const GAME_VERSIONS: readonly string[] = [GAME_VERSION];
export const ALLOWED_STAKES: readonly number[] = [10, 20, 50, 100];

export function isSupportedGameVersion(version: string): boolean {
  return GAME_VERSIONS.includes(version);
}

export function isAllowedStake(stake: number, configuredStake?: number): boolean {
  if (ALLOWED_STAKES.includes(stake)) {
    return true;
  }
  if (configuredStake !== undefined && stake === configuredStake) {
    return true;
  }
  return false;
}

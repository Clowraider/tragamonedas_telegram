import { randomInt } from "node:crypto";

/**
 * Injected randomness seam. Production uses `node:crypto.randomInt`
 * (CSPRNG); tests inject deterministic sequences so outcomes are
 * reproducible.
 */
export interface RandomSource {
  /**
   * Returns an integer in the half-open range [0, bound).
   */
  nextInt(bound: number): number;
}

export class CryptoRandomSource implements RandomSource {
  nextInt(bound: number): number {
    return randomInt(bound);
  }
}

export function createRandomSource(): RandomSource {
  return new CryptoRandomSource();
}

import { createHash } from "node:crypto";

import {
  SlotSymbolsSchema,
  type SpinRepresentation,
} from "@slot-machine/contracts";
import pg from "pg";

import { GAME_VERSION } from "../game/config.js";
import { evaluatePayout, generateOutcome } from "../game/engine.js";
import type { RandomSource } from "../game/random.js";

export const INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS";
export const IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT";
export const GAME_VERSION_MISMATCH = "GAME_VERSION_MISMATCH";
export const PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND";
export const ROUND_NOT_FOUND = "ROUND_NOT_FOUND";

export type SpinErrorCode =
  | typeof INSUFFICIENT_CREDITS
  | typeof IDEMPOTENCY_CONFLICT
  | typeof GAME_VERSION_MISMATCH
  | typeof PLAYER_NOT_FOUND
  | typeof ROUND_NOT_FOUND;

export class SpinError extends Error {
  constructor(
    readonly code: SpinErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpinError";
  }
}

export type SpinTerms = {
  stake: number;
  gameVersion: string;
};

export type CreateSpinInput = {
  playerId: string;
  idempotencyKey: string;
  terms: SpinTerms;
  configuredStake: number;
  random: RandomSource;
  pool: pg.Pool;
};

type RoundRow = {
  id: string;
  status: string;
  symbols: string[];
  stake: number;
  payout: number;
  balance_before: number;
  balance_after: number;
  game_version: string;
  created_at: Date;
};

function requestFingerprint(terms: SpinTerms): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ stake: terms.stake, gameVersion: terms.gameVersion }),
    )
    .digest("hex");
}

function rowToRepresentation(row: RoundRow): SpinRepresentation {
  const symbols = SlotSymbolsSchema.parse([
    row.symbols[0],
    row.symbols[1],
    row.symbols[2],
  ]);
  return {
    roundId: row.id,
    status: "settled",
    symbols,
    stake: row.stake,
    payout: row.payout,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    gameVersion: row.game_version,
    createdAt: row.created_at.toISOString(),
  };
}

function assertValidTerms(terms: SpinTerms, configuredStake: number): void {
  if (terms.stake !== configuredStake) {
    throw new SpinError(
      GAME_VERSION_MISMATCH,
      `The request stake does not match the configured game terms.`,
    );
  }
  if (terms.gameVersion !== GAME_VERSION) {
    throw new SpinError(
      GAME_VERSION_MISMATCH,
      `The request game version is not available: ${terms.gameVersion}`,
    );
  }
}

export async function getRound(
  pool: pg.Pool,
  playerId: string,
  roundId: string,
): Promise<SpinRepresentation> {
  const result = await pool.query<RoundRow>(
    `SELECT id, game_version, stake, reel_stops, symbols, payout,
            balance_before, balance_after, created_at
       FROM spin_rounds
      WHERE id = $1 AND player_id = $2`,
    [roundId, playerId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new SpinError(ROUND_NOT_FOUND, "The requested round was not found.");
  }
  return rowToRepresentation(row);
}

export async function listRounds(
  pool: pg.Pool,
  playerId: string,
  limit: number,
  cursor?: string,
): Promise<{ items: SpinRepresentation[]; nextCursor: string | null }> {
  const params: unknown[] = [playerId, limit + 1];
  let where = "player_id = $1";
  if (cursor) {
    const cursorResult = await pool.query<{ created_at: Date }>(
      `SELECT created_at FROM spin_rounds WHERE id = $1 AND player_id = $2`,
      [cursor, playerId],
    );
    const cursorRow = cursorResult.rows[0];
    if (!cursorRow) {
      throw new SpinError(
        ROUND_NOT_FOUND,
        "The requested cursor was not found.",
      );
    }
    params.push(cursorRow.created_at, cursor);
    where = `${where} AND (created_at, id) < ($3, $4)`;
  }
  const result = await pool.query<RoundRow>(
    `SELECT id, game_version, stake, reel_stops, symbols, payout,
            balance_before, balance_after, created_at
       FROM spin_rounds
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    params,
  );
  const rows = result.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(rowToRepresentation),
    nextCursor: hasMore && last ? last.id : null,
  };
}

/**
 * Executes one atomic spin settlement. The whole operation is a single
 * transaction: the wallet row is locked FOR UPDATE, prior idempotency
 * state is checked, the outcome is generated from the injected source,
 * and the round insert plus wallet update commit together.
 */
export async function createSpin(input: CreateSpinInput): Promise<{
  representation: SpinRepresentation;
  replayed: boolean;
}> {
  const { playerId, idempotencyKey, terms, configuredStake, random, pool } =
    input;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletResult = await client.query<{ balance: number }>(
      `SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE`,
      [playerId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new SpinError(PLAYER_NOT_FOUND, "The player has no wallet.");
    }

    const priorResult = await client.query<RoundRow>(
      `SELECT id, game_version, stake, reel_stops, symbols, payout,
              balance_before, balance_after, created_at
         FROM spin_rounds
        WHERE player_id = $1 AND idempotency_key = $2
        FOR UPDATE`,
      [playerId, idempotencyKey],
    );
    const prior = priorResult.rows[0];
    if (prior) {
      const priorTerms: SpinTerms = {
        stake: prior.stake,
        gameVersion: prior.game_version,
      };
      if (requestFingerprint(priorTerms) !== requestFingerprint(terms)) {
        throw new SpinError(
          IDEMPOTENCY_CONFLICT,
          "The idempotency key was already used for different game terms.",
        );
      }
      await client.query("COMMIT");
      return { representation: rowToRepresentation(prior), replayed: true };
    }

    assertValidTerms(terms, configuredStake);

    if (wallet.balance < terms.stake) {
      throw new SpinError(
        INSUFFICIENT_CREDITS,
        "The player balance is below the fixed stake.",
      );
    }

    const { stops, symbols } = generateOutcome(random);
    const payout = evaluatePayout(symbols, terms.gameVersion, terms.stake);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - terms.stake + payout;

    const insertResult = await client.query<RoundRow>(
      `INSERT INTO spin_rounds
         (player_id, idempotency_key, request_fingerprint, game_version,
          stake, reel_stops, symbols, payout, balance_before, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, game_version, stake, reel_stops, symbols, payout,
                 balance_before, balance_after, created_at`,
      [
        playerId,
        idempotencyKey,
        requestFingerprint(terms),
        terms.gameVersion,
        terms.stake,
        stops,
        symbols,
        payout,
        balanceBefore,
        balanceAfter,
      ],
    );
    const inserted = insertResult.rows[0];
    if (!inserted) {
      throw new Error("Spin round insert returned no row");
    }

    await client.query(
      `UPDATE wallets SET balance = $2, version = version + 1
        WHERE player_id = $1`,
      [playerId, balanceAfter],
    );

    await client.query("COMMIT");
    return { representation: rowToRepresentation(inserted), replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

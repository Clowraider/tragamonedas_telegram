import pg from "pg";

import type { Identity } from "../auth/types.js";

export type PlayerWallet = {
  playerId: string;
  balance: number;
  authProvider: string;
  providerSubject: string;
  createdAt: Date;
};

export async function bootstrapPlayer(
  pool: pg.Pool,
  identity: Identity,
  startingBalance: number,
): Promise<PlayerWallet> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingResult = await client.query<{
      id: string;
      created_at: Date;
    }>(
      "SELECT id, created_at FROM players WHERE auth_provider = $1 AND provider_subject = $2 FOR UPDATE",
      [identity.provider, identity.providerSubject],
    );

    let playerId: string;
    let createdAt: Date;
    const existing = existingResult.rows[0];
    if (!existing) {
      const insertResult = await client.query<{
        id: string;
        created_at: Date;
      }>(
        "INSERT INTO players (auth_provider, provider_subject) VALUES ($1, $2) RETURNING id, created_at",
        [identity.provider, identity.providerSubject],
      );
      const inserted = insertResult.rows[0];
      if (!inserted) {
        throw new Error("Failed to insert player");
      }
      playerId = inserted.id;
      createdAt = inserted.created_at;
      await client.query(
        "INSERT INTO wallets (player_id, balance) VALUES ($1, $2)",
        [playerId, startingBalance],
      );
    } else {
      playerId = existing.id;
      createdAt = existing.created_at;
    }

    const walletResult = await client.query<{ balance: number }>(
      "SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE",
      [playerId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new Error("Wallet not found for player");
    }

    await client.query("COMMIT");
    return {
      playerId,
      balance: wallet.balance,
      authProvider: identity.provider,
      providerSubject: identity.providerSubject,
      createdAt,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

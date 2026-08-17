import pg from "pg";

import type { Identity } from "../auth/types.js";

export type PlayerWallet = {
  playerId: string;
  balance: number;
  authProvider: string;
  providerSubject: string;
  username: string | null;
  firstName: string | null;
  createdAt: Date;
  updatedAt: Date;
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
      username: string | null;
      first_name: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      "SELECT id, username, first_name, created_at, updated_at FROM players WHERE auth_provider = $1 AND provider_subject = $2 FOR UPDATE",
      [identity.provider, identity.providerSubject],
    );

    let playerId: string;
    let createdAt: Date;
    let updatedAt: Date;
    const currentUsername = identity.username ?? null;
    const currentFirstName = identity.firstName ?? null;

    const existing = existingResult.rows[0];
    if (!existing) {
      const insertResult = await client.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        "INSERT INTO players (auth_provider, provider_subject, username, first_name, updated_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, created_at, updated_at",
        [
          identity.provider,
          identity.providerSubject,
          currentUsername,
          currentFirstName,
        ],
      );
      const inserted = insertResult.rows[0];
      if (!inserted) {
        throw new Error("Failed to insert player");
      }
      playerId = inserted.id;
      createdAt = inserted.created_at;
      updatedAt = inserted.updated_at;
      await client.query(
        "INSERT INTO wallets (player_id, balance) VALUES ($1, $2)",
        [playerId, startingBalance],
      );
    } else {
      playerId = existing.id;
      createdAt = existing.created_at;
      const updateResult = await client.query<{ updated_at: Date }>(
        "UPDATE players SET username = $1, first_name = $2, updated_at = NOW() WHERE id = $3 RETURNING updated_at",
        [currentUsername, currentFirstName, playerId],
      );
      updatedAt = updateResult.rows[0]?.updated_at ?? existing.updated_at;
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
      username: currentUsername,
      firstName: currentFirstName,
      createdAt,
      updatedAt,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

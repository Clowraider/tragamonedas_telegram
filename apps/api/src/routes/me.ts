import type { FastifyInstance } from "fastify";
import pg from "pg";

import type { AppConfig } from "../config.js";
import { bootstrapPlayer } from "../db/bootstrap.js";
import { listRounds } from "../spins/spin.service.js";

export async function meRoute(app: FastifyInstance): Promise<void> {
  const pool: pg.Pool = (app as unknown as { pool: pg.Pool }).pool;
  const config: AppConfig = (app as unknown as { config: AppConfig }).config;

  app.get("/me", async (request) => {
    const player = await bootstrapPlayer(
      pool,
      request.identity,
      config.startingBalance,
    );

    const history = await listRounds(pool, player.playerId, 1);
    const recentRound = history.items[0] ?? null;

    return {
      playerId: player.playerId,
      balance: player.balance,
      stake: config.stake,
      gameVersion: config.gameVersion,
      recentRound,
    };
  });
}

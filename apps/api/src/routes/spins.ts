import type { FastifyInstance } from "fastify";
import pg from "pg";
import {
  HistoryQuerySchema,
  IdempotencyKeySchema,
  SpinRequestSchema,
} from "@slot-machine/contracts";

import type { AppConfig } from "../config.js";
import { CryptoRandomSource } from "../game/random.js";
import {
  SpinError,
  createSpin,
  getRound,
  listRounds,
} from "../spins/spin.service.js";

const ERROR_STATUS: Record<string, number> = {
  INSUFFICIENT_CREDITS: 422,
  GAME_VERSION_MISMATCH: 422,
  IDEMPOTENCY_CONFLICT: 409,
  ROUND_NOT_FOUND: 404,
  PLAYER_NOT_FOUND: 404,
};

export async function spinsRoute(app: FastifyInstance): Promise<void> {
  const pool: pg.Pool = (app as unknown as { pool: pg.Pool }).pool;
  const config: AppConfig = (app as unknown as { config: AppConfig }).config;

  app.post("/spins", async (request, reply) => {
    const keyHeader = request.headers["idempotency-key"];
    const keyParse = IdempotencyKeySchema.safeParse(keyHeader);
    if (!keyParse.success) {
      reply.code(400).send({
        code: "BAD_REQUEST",
        message: "Missing or invalid Idempotency-Key header (UUID required)",
        requestId: request.id,
      });
      return;
    }

    const bodyParse = SpinRequestSchema.safeParse(request.body);
    if (!bodyParse.success) {
      reply.code(400).send({
        code: "BAD_REQUEST",
        message: bodyParse.error.issues[0]?.message ?? "Invalid request body",
        requestId: request.id,
      });
      return;
    }

    try {
      const result = await createSpin({
        playerId: request.playerId,
        idempotencyKey: keyParse.data,
        terms: bodyParse.data,
        configuredStake: config.stake,
        random: new CryptoRandomSource(),
        pool,
      });

      reply.code(result.replayed ? 200 : 201).send(result.representation);
    } catch (error) {
      if (error instanceof SpinError) {
        const status = ERROR_STATUS[error.code] ?? 500;
        reply.code(status).send({
          code: error.code,
          message: error.message,
          requestId: request.id,
        });
        return;
      }
      throw error;
    }
  });

  app.get<{ Params: { roundId: string } }>(
    "/spins/:roundId",
    async (request, reply) => {
      try {
        const round = await getRound(
          pool,
          request.playerId,
          request.params.roundId,
        );
        return round;
      } catch (error) {
        if (error instanceof SpinError) {
          const status = ERROR_STATUS[error.code] ?? 500;
          reply.code(status).send({
            code: error.code,
            message: error.message,
            requestId: request.id,
          });
          return;
        }
        throw error;
      }
    },
  );

  app.get("/spins", async (request, reply) => {
    const queryParse = HistoryQuerySchema.safeParse(request.query);
    if (!queryParse.success) {
      reply.code(400).send({
        code: "BAD_REQUEST",
        message:
          queryParse.error.issues[0]?.message ?? "Invalid query parameters",
        requestId: request.id,
      });
      return;
    }

    const { limit, cursor } = queryParse.data;
    try {
      const history = await listRounds(pool, request.playerId, limit, cursor);
      return history;
    } catch (error) {
      if (error instanceof SpinError) {
        const status = ERROR_STATUS[error.code] ?? 500;
        reply.code(status).send({
          code: error.code,
          message: error.message,
          requestId: request.id,
        });
        return;
      }
      throw error;
    }
  });
}

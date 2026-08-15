import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";

import { type AppConfig, loadConfig } from "./config.js";
import { bootstrapPlayer } from "./db/bootstrap.js";
import {
  telegramIdentity,
  validateTelegramInitData,
} from "./auth/telegram.js";
import { createDevelopmentProvider } from "./auth/development.js";
import type { Identity } from "./auth/types.js";
import { meRoute } from "./routes/me.js";
import { spinsRoute } from "./routes/spins.js";
import { healthRoute } from "./routes/health.js";
import { metricsRoute } from "./routes/metrics.js";

declare module "fastify" {
  interface FastifyRequest {
    playerId: string;
    identity: Identity;
  }
}

export type AppDependencies = {
  pool: pg.Pool;
  config: AppConfig;
};

export async function buildApp(
  deps?: Partial<AppDependencies>,
): Promise<FastifyInstance> {
  const config = deps?.config ?? loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers[\"x-telegram-init-data\"]",
        "req.headers.cookie",
      ],
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      if (typeof incoming === "string" && incoming.length > 0) {
        return incoming;
      }
      return crypto.randomUUID();
    },
    requestIdHeader: "x-request-id",
  });

  const pool =
    deps?.pool ??
    new pg.Pool({
      connectionString: config.databaseUrl,
    });

  app.decorate("pool", pool);
  app.decorate("config", config);

  app.decorateRequest("playerId", "");
  app.decorateRequest("identity", null as unknown as Identity);

  // Authenticate on /v1/* routes
  app.register(async (instance) => {
    instance.addHook("onRequest", async (request, reply) => {
      let identity: Identity;

      if (config.authMode === "telegram") {
        const initData = request.headers["x-telegram-init-data"];
        if (typeof initData !== "string" || initData.length === 0) {
          reply.code(401).send({
            code: "UNAUTHORIZED",
            message: "Missing Telegram init data",
            requestId: request.id,
          });
          return;
        }
        try {
          const result = validateTelegramInitData(
            initData,
            config.telegramBotToken!,
            config.authDateMaxAgeSeconds,
          );
          identity = telegramIdentity(result);
        } catch {
          reply.code(401).send({
            code: "UNAUTHORIZED",
            message: "Invalid Telegram init data",
            requestId: request.id,
          });
          return;
        }
      } else {
        try {
          const provider = createDevelopmentProvider(config);
          identity = provider();
        } catch {
          reply.code(401).send({
            code: "UNAUTHORIZED",
            message: "Development auth is not available",
            requestId: request.id,
          });
          return;
        }
      }

      const player = await bootstrapPlayer(
        pool,
        identity,
        config.startingBalance,
      );
      request.playerId = player.playerId;
      request.identity = identity;
    });

    instance.register(meRoute, { prefix: "/v1" });
    instance.register(spinsRoute, { prefix: "/v1" });
  });

  // Health/metrics do not require auth
  app.register(healthRoute);
  app.register(metricsRoute);

  return app;
}

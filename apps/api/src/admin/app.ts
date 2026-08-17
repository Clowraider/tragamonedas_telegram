import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { type AppConfig, loadConfig } from "../config.js";
import { createAdminAuthHook } from "./auth.js";
import { adminAuditLogsRoute } from "./routes/audit-logs.js";
import { adminAuthRoute } from "./routes/auth.js";
import { adminMetricsRoute } from "./routes/metrics.js";
import { adminPlayersRoute } from "./routes/players.js";
import { adminSpinsRoute } from "./routes/spins.js";

declare module "fastify" {
  interface FastifyInstance {
    pool: pg.Pool;
    config: AppConfig;
  }
}

export type AdminAppDependencies = {
  pool: pg.Pool;
  config: AppConfig;
};

export async function buildAdminApp(
  deps?: Partial<AdminAppDependencies>,
): Promise<FastifyInstance> {
  const config = deps?.config ?? loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers['x-admin-api-key']",
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

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-api-key", "x-request-id"],
  });

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const uiRoot = path.resolve(currentDir, "./ui");

  await app.register(fastifyStatic, {
    root: uiRoot,
    prefix: "/",
  });

  app.decorate("pool", pool);
  app.decorate("config", config);

  // Authenticated Admin API sub-tree under /api/admin and /admin
  const registerAdminRoutes = (prefix: string) => {
    app.register(
      async (instance) => {
        instance.addHook("onRequest", createAdminAuthHook(config.adminApiKey));

        instance.register(adminAuthRoute);
        instance.register(adminMetricsRoute);
        instance.register(adminPlayersRoute);
        instance.register(adminSpinsRoute);
        instance.register(adminAuditLogsRoute);
      },
      { prefix },
    );
  };

  registerAdminRoutes("/api/admin");
  registerAdminRoutes("/admin");

  return app;
}

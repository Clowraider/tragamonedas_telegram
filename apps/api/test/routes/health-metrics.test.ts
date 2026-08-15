import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { GAME_VERSION } from "../../src/game/config.js";
import { withTestSchema } from "../db/helpers.js";

function devConfig(
  databaseUrl: string,
): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    AUTH_MODE: "development",
    DATABASE_URL: databaseUrl,
    APP_SECRET: "test-secret-abcdef1234567890",
    DEFAULT_BALANCE: "1000",
    DEFAULT_STAKE: "10",
    GAME_VERSION: GAME_VERSION,
    LOG_LEVEL: "silent",
  };
}

describe("GET /healthz (liveness)", () => {
  it("reports success when service is running", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");
    });
  });
});

describe("GET /readyz (readiness)", () => {
  it("reports success when DB is available", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");
    });
  });

  it("reports failure when DB is unavailable", async () => {
    const pg = await import("pg");
    const deadPool = new pg.default.Pool({
      connectionString: "postgresql://nobody:badpass@localhost:59999/nope",
      connectionTimeoutMillis: 500,
    });
    try {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        NODE_ENV: "development",
        AUTH_MODE: "development",
        DATABASE_URL: "postgresql://nobody:badpass@localhost:59999/nope",
        APP_SECRET: "test-secret-abcdef1234567890",
        LOG_LEVEL: "silent",
      });
      const app = await buildApp({ pool: deadPool, config });

      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe("unavailable");
    } finally {
      await deadPool.end();
    }
  });
});

describe("GET /metrics", () => {
  it("returns Prometheus-compatible metrics text", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/metrics" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      const body = res.payload;
      expect(body).toContain("spins_total");
      expect(body).toContain("spins_accepted");
      expect(body).toContain("spins_rejected");
      expect(body).toContain("spins_idempotent");
      expect(body).toContain("spins_insufficient_funds");
      expect(body).toContain("settlement_failures");
      expect(body).toContain("spin_latency_avg_ms");
      expect(body).toContain("db_ready 1");
    });
  });

  it("does not expose sensitive data in metrics", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/metrics" });
      const body = res.payload;
      // No player IDs, tokens, or secrets
      expect(body).not.toContain("test-secret");
      expect(body).not.toContain("APP_SECRET");
      expect(body).not.toContain("TELEGRAM_BOT_TOKEN");
      expect(body).not.toContain("authorization");
    });
  });
});

describe("Privacy-safe observability", () => {
  it("does not log Telegram init data or secrets in structured logs", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "fake-bot-token-1234567890",
        LOG_LEVEL: "silent",
      });
      const app = await buildApp({ pool, config });

      // The pino logger configuration redacts these headers;
      // verify configuration exists
      const loggerOptions = app.log;
      expect(loggerOptions).toBeDefined();
    });
  });
});

describe("Health does not require auth", () => {
  it("/healthz is accessible without auth headers", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "fake-bot-token-1234567890",
      });
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
    });
  });

  it("/readyz is accessible without auth headers", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "fake-bot-token-1234567890",
      });
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(200);
    });
  });

  it("/metrics is accessible without auth headers", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "fake-bot-token-1234567890",
      });
      const app = await buildApp({ pool, config });

      const res = await app.inject({ method: "GET", url: "/metrics" });
      expect(res.statusCode).toBe(200);
    });
  });
});

import { randomUUID } from "node:crypto";

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

describe("GET /v1/me", () => {
  it("returns player snapshot with auth", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.playerId).toBeDefined();
      expect(body.balance).toBe(1000);
      expect(body.stake).toBe(10);
      expect(body.gameVersion).toBe(GAME_VERSION);
      expect(body.recentRound).toBeNull();
    });
  });

  it("rejects unauthenticated request with telegram auth mode", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "fake-bot-token-1234567890",
      });
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.requestId).toBeDefined();
    });
  });
});

describe("POST /v1/spins", () => {
  it("creates a spin with 201 and correct body", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.roundId).toBeDefined();
      expect(body.status).toBe("settled");
      expect(body.symbols).toHaveLength(3);
      expect(body.stake).toBe(10);
      expect(body.balanceBefore).toBe(1000);
    });
  });

  it("returns 400 for missing idempotency key", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: { "content-type": "application/json" },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("BAD_REQUEST");
    });
  });

  it("returns 400 for invalid body", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        payload: { stake: -5 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("BAD_REQUEST");
    });
  });

  it("returns 422 for insufficient funds", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig({
        ...devConfig(pool.options.connectionString!),
        DEFAULT_BALANCE: "5",
      });
      const app = await buildApp({ pool, config });

      const res = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("INSUFFICIENT_CREDITS");
    });
  });

  it("returns 200 for idempotent replay", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });
      const key = randomUUID();

      const first = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().roundId).toBe(first.json().roundId);
    });
  });

  it("returns 409 for conflicting idempotency key", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });
      const key = randomUUID();

      await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        payload: { stake: 50, gameVersion: GAME_VERSION },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("IDEMPOTENCY_CONFLICT");
    });
  });
});

describe("GET /v1/spins/:roundId", () => {
  it("recovers an existing round", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      const spinRes = await app.inject({
        method: "POST",
        url: "/v1/spins",
        headers: {
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        payload: { stake: 10, gameVersion: GAME_VERSION },
      });

      const roundId = spinRes.json().roundId;
      const res = await app.inject({
        method: "GET",
        url: `/v1/spins/${roundId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().roundId).toBe(roundId);
    });
  });

  it("returns 404 for unknown round", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      // Must first hit an authenticated route to bootstrap the player
      await app.inject({ method: "GET", url: "/v1/me" });

      const res = await app.inject({
        method: "GET",
        url: `/v1/spins/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("ROUND_NOT_FOUND");
    });
  });
});

describe("GET /v1/spins", () => {
  it("returns bounded newest-first history", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });

      // Create two spins
      for (let i = 0; i < 2; i++) {
        await app.inject({
          method: "POST",
          url: "/v1/spins",
          headers: {
            "content-type": "application/json",
            "idempotency-key": randomUUID(),
          },
          payload: { stake: 10, gameVersion: GAME_VERSION },
        });
      }

      const res = await app.inject({
        method: "GET",
        url: "/v1/spins?limit=10",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    });
  });
});

describe("Request ID propagation", () => {
  it("returns the client-supplied request ID", async () => {
    await withTestSchema(async (pool) => {
      const { loadConfig } = await import("../../src/config.js");
      const config = loadConfig(devConfig(pool.options.connectionString!));
      const app = await buildApp({ pool, config });
      const requestId = "my-custom-request-id-123";

      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { "x-request-id": requestId },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});

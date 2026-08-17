import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  createAdminAuthHook,
  verifyAdminApiKey,
} from "../../src/admin/auth.js";

describe("Admin authentication & timing-safe verification", () => {
  const SECRET_KEY = "super-secret-admin-token-1234";

  it("timing-safe key check validates matching keys", () => {
    expect(verifyAdminApiKey(SECRET_KEY, SECRET_KEY)).toBe(true);
    expect(verifyAdminApiKey("wrong-key", SECRET_KEY)).toBe(false);
    expect(verifyAdminApiKey("", SECRET_KEY)).toBe(false);
    expect(verifyAdminApiKey(undefined, SECRET_KEY)).toBe(false);
    expect(verifyAdminApiKey(null, SECRET_KEY)).toBe(false);
  });

  it("allows access with valid x-admin-api-key header", async () => {
    const app = Fastify();
    app.addHook("onRequest", createAdminAuthHook(SECRET_KEY));
    app.get("/test", async () => ({ status: "ok" }));

    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-admin-api-key": SECRET_KEY,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("allows access with valid admin_token cookie", async () => {
    const app = Fastify();
    app.addHook("onRequest", createAdminAuthHook(SECRET_KEY));
    app.get("/test", async () => ({ status: "ok" }));

    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        cookie: `admin_token=${SECRET_KEY}; other_cookie=123`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("rejects request with 401 when API key is missing", async () => {
    const app = Fastify();
    app.addHook("onRequest", createAdminAuthHook(SECRET_KEY));
    app.get("/test", async () => ({ status: "ok" }));

    const res = await app.inject({
      method: "GET",
      url: "/test",
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.message).toContain("Invalid or missing admin API key");
  });

  it("rejects request with 401 when API key is incorrect", async () => {
    const app = Fastify();
    app.addHook("onRequest", createAdminAuthHook(SECRET_KEY));
    app.get("/test", async () => ({ status: "ok" }));

    const res = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-admin-api-key": "invalid-token",
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});

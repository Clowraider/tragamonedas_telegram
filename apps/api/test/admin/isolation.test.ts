import { describe, expect, it } from "vitest";
import { buildAdminApp } from "../../src/admin/app.js";
import { buildApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { withTestSchema } from "../db/helpers.js";

describe("Network Port & Route Isolation", () => {
  it("verifies admin routes are not exposed on the public player app (:3000)", async () => {
    await withTestSchema(async (pool) => {
      const config = loadConfig({
        ...process.env,
        AUTH_MODE: "development",
      });

      const playerApp = await buildApp({ config, pool });

      // Request admin endpoints against the player app
      const metricsRes = await playerApp.inject({
        method: "GET",
        url: "/api/admin/metrics",
        headers: {
          "x-admin-api-key": config.adminApiKey,
        },
      });
      expect(metricsRes.statusCode).toBe(404);

      const adjustRes = await playerApp.inject({
        method: "POST",
        url: "/api/admin/players/00000000-0000-0000-0000-000000000000/adjust",
        headers: {
          "x-admin-api-key": config.adminApiKey,
        },
      });
      expect(adjustRes.statusCode).toBe(404);

      await playerApp.close();
    });
  });

  it("verifies player spin routes are not exposed on the admin app (:3001)", async () => {
    await withTestSchema(async (pool) => {
      const config = loadConfig({
        ...process.env,
        AUTH_MODE: "development",
      });

      const adminApp = await buildAdminApp({ config, pool });

      const playerSpinsRes = await adminApp.inject({
        method: "POST",
        url: "/v1/spins",
      });
      expect(playerSpinsRes.statusCode).toBe(404);

      await adminApp.close();
    });
  });
});

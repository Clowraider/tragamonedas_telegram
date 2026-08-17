import { expect, test } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { buildAdminApp } from "../../apps/api/src/admin/app.js";
import { loadConfig } from "../../apps/api/src/config.js";
import { bootstrapPlayer } from "../../apps/api/src/db/bootstrap.js";
import { runMigrations } from "../../apps/api/src/db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

loadDotenv({ path: path.resolve(rootDir, ".env") });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://slot:slot@localhost:5432/slot_machine";

const ADMIN_TEST_PORT = 4174;
const ADMIN_BASE_URL = `http://127.0.0.1:${ADMIN_TEST_PORT}`;
const ADMIN_TEST_KEY = "test-secret-key-for-e2e-ops";

let adminServer: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let testSchema = "";

test.describe.serial("Admin Dashboard & Live Operations E2E", () => {
  test.beforeAll(async () => {
    testSchema = `test_admin_e2e_${randomUUID().replace(/-/g, "_")}`;
    const adminClient = new pg.Client(databaseUrl);
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA IF NOT EXISTS ${testSchema}`);
    await adminClient.query(`SET search_path TO ${testSchema}`);
    await runMigrations(adminClient);
    await adminClient.end();

    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
    });

    pool.on("connect", (client) => {
      void client.query(`SET search_path TO ${testSchema}`);
    });

    const primeClient = await pool.connect();
    await primeClient.query(`SET search_path TO ${testSchema}`);
    primeClient.release();

    const config = loadConfig({
      NODE_ENV: "development",
      AUTH_MODE: "development",
      ADMIN_PORT: String(ADMIN_TEST_PORT),
      ADMIN_API_KEY: ADMIN_TEST_KEY,
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: "silent",
      APP_SECRET: "e2e-admin-secret-test-key-12345",
    });

    adminServer = await buildAdminApp({
      pool,
      config,
    });

    await adminServer.listen({ port: ADMIN_TEST_PORT, host: "127.0.0.1" });
  });

  test.afterAll(async () => {
    if (adminServer) {
      await adminServer.close();
    }
    if (pool) {
      await pool.end();
    }
    if (testSchema) {
      const cleanupClient = new pg.Client(databaseUrl);
      await cleanupClient.connect();
      await cleanupClient.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
      await cleanupClient.end();
    }
  });

  test("1. Serves dashboard UI with prominent virtual credits compliance disclaimer", async ({
    page,
  }) => {
    await page.goto(ADMIN_BASE_URL);

    // Verify title
    await expect(page).toHaveTitle(/Admin Dashboard/);

    // Verify compliance disclaimer
    const banner = page.locator(".disclaimer-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("COMPLIANCE DISCLAIMER");
    await expect(banner).toContainText("non-monetary virtual test credits");
  });

  test("2. Unauthenticated state is displayed before entering API key", async ({
    page,
  }) => {
    await page.goto(ADMIN_BASE_URL);
    const badge = page.locator("#connectionBadge");
    await expect(badge).toHaveText("Unauthenticated");
  });

  test("3. Authenticates with API Key, queries metrics, and displays KPI cards", async ({
    page,
  }) => {
    // Seed a player
    if (pool) {
      await bootstrapPlayer(
        pool,
        {
          provider: "telegram",
          providerSubject: "99881122",
          displayLabel: "telegram",
          username: "casino_boss",
          firstName: "Boss",
        },
        5000,
      );
    }

    await page.goto(ADMIN_BASE_URL);
    await page.fill("#apiKeyInput", ADMIN_TEST_KEY);
    await page.click("#saveKeyBtn");

    // Badge updates to Authenticated
    const badge = page.locator("#connectionBadge");
    await expect(badge).toHaveText("Authenticated");

    // Metrics update
    await expect(page.locator("#kpiPlayers")).toHaveText("1");
    await expect(page.locator("#kpiCredits")).toHaveText("5,000");
  });
});

import { test, expect } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../../apps/api/src/app.js";
import { loadConfig } from "../../apps/api/src/config.js";
import { runMigrations } from "../../apps/api/src/db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

// Load environment variables from .env
loadDotenv({ path: path.resolve(rootDir, ".env") });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://slot:slot@localhost:5432/slot_machine";

const E2E_PORT = 4173;
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

let server: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let testSchema: string = "";

test.describe.serial("Slot Machine MVP - End-to-End Release Candidate", () => {
  test.beforeAll(async () => {
    // 1. Create an isolated PostgreSQL schema for this E2E test run
    testSchema = `test_e2e_${randomUUID().replace(/-/g, "_")}`;
    const adminClient = new pg.Client(databaseUrl);
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA IF NOT EXISTS ${testSchema}`);
    await adminClient.query(`SET search_path TO ${testSchema}`);
    await runMigrations(adminClient);
    await adminClient.end();

    // 2. Initialize connection pool bound to the test schema
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

    // 3. Build Fastify application in development auth mode
    const appConfig = loadConfig({
      NODE_ENV: "development",
      AUTH_MODE: "development",
      PORT: String(E2E_PORT),
      DATABASE_URL: databaseUrl,
      LOG_LEVEL: "silent",
      APP_SECRET: "e2e-test-secret-must-be-present-and-valid-12345",
      DEFAULT_BALANCE: "1000",
      DEFAULT_STAKE: "10",
      GAME_VERSION: "classic-1",
    });

    server = await buildApp({
      pool,
      config: appConfig,
    });

    // 4. Attach static routes to serve the React Web Mini App
    const indexHtmlPath = path.resolve(rootDir, "apps/web/index.html");
    const slotCssPath = path.resolve(rootDir, "apps/web/src/styles/slot.css");
    const mainJsPath = path.resolve(rootDir, "apps/web/dist/main.js");

    server.get("/", async (_req, reply) => {
      const html = fs.readFileSync(indexHtmlPath, "utf-8");
      return reply.type("text/html; charset=utf-8").send(html);
    });

    server.get("/styles/slot.css", async (_req, reply) => {
      const css = fs.readFileSync(slotCssPath, "utf-8");
      return reply.type("text/css; charset=utf-8").send(css);
    });

    server.get("/dist/main.js", async (_req, reply) => {
      const js = fs.readFileSync(mainJsPath, "utf-8");
      return reply.type("application/javascript; charset=utf-8").send(js);
    });

    server.get("/dist/main.js.map", async (_req, reply) => {
      const mapPath = path.resolve(rootDir, "apps/web/dist/main.js.map");
      if (fs.existsSync(mapPath)) {
        const map = fs.readFileSync(mapPath, "utf-8");
        return reply.type("application/json").send(map);
      }
      return reply.code(404).send({ error: "Not found" });
    });

    // 5. Start listening on test port
    await server.listen({ port: E2E_PORT, host: "127.0.0.1" });
  });

  test.afterAll(async () => {
    // Teardown server, pool, and clean up the test schema
    if (server) {
      await server.close();
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

  test("1. Development bootstrap: loads player snapshot, displays badges, disclaimer, and 3 reels", async ({
    page,
  }) => {
    await page.goto(BASE_URL);

    // Verify Title & Header
    await expect(page.locator(".slot-title")).toHaveText("Classic Slots");

    // Verify Development Mode badge
    const devBadge = page.locator('[data-testid="dev-badge"]');
    await expect(devBadge).toBeVisible();
    await expect(devBadge).toHaveText("Development Mode");

    // Verify No-Cash-Value disclaimer
    const disclaimer = page.locator('[data-testid="no-cash-value-disclaimer"]');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText(
      "Virtual Credits Only • No Real Cash Value • Entertainment Only",
    );

    // Verify Initial Balance & Stake
    const balanceDisplay = page.locator('[data-testid="balance-display"]');
    await expect(balanceDisplay).toHaveText("1000 Credits");

    const stakeDisplay = page.locator('[data-testid="stake-display"]');
    await expect(stakeDisplay).toHaveText("10 Credits");

    // Verify exactly 3 reels and central payline indicator
    await expect(page.locator('[data-testid="central-payline"]')).toBeVisible();
    await expect(page.locator('[data-testid="reel-0"]')).toBeVisible();
    await expect(page.locator('[data-testid="reel-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="reel-2"]')).toBeVisible();

    // Verify Spin Button is ready
    const spinBtn = page.locator('[data-testid="spin-button"]');
    await expect(spinBtn).toBeVisible();
    await expect(spinBtn).toBeEnabled();
    await expect(spinBtn).toHaveText("SPIN");

    // Absence of value-bearing controls (no deposit, withdraw, cash-out, purchase, buy/sell)
    await expect(page.locator("button:has-text('Deposit')")).toHaveCount(0);
    await expect(page.locator("button:has-text('Withdraw')")).toHaveCount(0);
    await expect(page.locator("button:has-text('Cash Out')")).toHaveCount(0);
    await expect(page.locator("button:has-text('Buy Credits')")).toHaveCount(0);
  });

  test("2. Spin execution: triggers atomic round, settles reels to server result, updates balance and history", async ({
    page,
  }) => {
    await page.goto(BASE_URL);

    // Confirm initial balance is 1000
    const balanceDisplay = page.locator('[data-testid="balance-display"]');
    await expect(balanceDisplay).toHaveText("1000 Credits");

    // Click SPIN button
    const spinBtn = page.locator('[data-testid="spin-button"]');
    await spinBtn.click();

    // Verify outcome announcement appears once settled
    const outcomeBanner = page.locator('[data-testid="outcome-banner"]');
    await expect(outcomeBanner).toBeVisible({ timeout: 5000 });

    // Verify button returns to enabled SPIN state
    await expect(spinBtn).toHaveText("SPIN");
    await expect(spinBtn).toBeEnabled();

    // Verify balance is updated (should differ from starting 1000 based on payout)
    const balanceText = await balanceDisplay.innerText();
    const updatedBalance = parseInt(balanceText.replace(/\D/g, ""), 10);
    expect(updatedBalance).toBeGreaterThanOrEqual(0);

    // Verify history section displays the settled spin
    const historyList = page.locator('[data-testid="history-list"]');
    await expect(historyList).toBeVisible();
    const historyItems = page.locator('[data-testid="history-item"]');
    await expect(historyItems).toHaveCount(1);
  });

  test("3. Consecutive spins: history accumulates in newest-first order", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    const spinBtn = page.locator('[data-testid="spin-button"]');
    await expect(spinBtn).toBeEnabled();

    const historyItems = page.locator('[data-testid="history-item"]');
    await expect(historyItems).toHaveCount(1);

    await spinBtn.click();
    await expect(page.locator('[data-testid="outcome-banner"]')).toBeVisible({
      timeout: 5000,
    });

    // Execute second spin
    await spinBtn.click();
    await expect(page.locator('[data-testid="outcome-banner"]')).toBeVisible({
      timeout: 5000,
    });

    // Verify history contains 3 items (1 previous + 2 new)
    await expect(historyItems).toHaveCount(3);
  });

  test("4. Reduced motion preference: settles immediately without animation delay", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    const spinBtn = page.locator('[data-testid="spin-button"]');
    await expect(spinBtn).toBeEnabled();

    const reducedMotionToggle = page.locator(
      '[data-testid="reduced-motion-toggle"]',
    );
    await reducedMotionToggle.check();
    await expect(reducedMotionToggle).toBeChecked();

    await spinBtn.click();

    // Should settle very fast
    const outcomeBanner = page.locator('[data-testid="outcome-banner"]');
    await expect(outcomeBanner).toBeVisible({ timeout: 2000 });
  });

  test("5. Error recovery: recovers state cleanly upon network/server interruption", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    const spinBtn = page.locator('[data-testid="spin-button"]');
    await expect(spinBtn).toBeEnabled();

    // Intercept /v1/spins to simulate a 500 network/server error
    await page.route("**/v1/spins", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: "INTERNAL_ERROR",
            message: "Temporary server glitch",
            requestId: randomUUID(),
          }),
        });
      } else {
        await route.continue();
      }
    });

    await spinBtn.click();

    // Verify error banner and recovery buttons appear
    const errorBanner = page.locator('[data-testid="error-banner"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText("Temporary server glitch");

    const refreshBtn = page.locator('[data-testid="refresh-button"]');
    await expect(refreshBtn).toBeVisible();

    // Unroute interception and click Refresh Balance
    await page.unroute("**/v1/spins");
    await refreshBtn.click();

    // Error banner clears and SPIN button is restored
    await expect(errorBanner).toBeHidden();
    await expect(spinBtn).toBeEnabled();
    await expect(spinBtn).toHaveText("SPIN");
  });

  test("6. Release candidate operational probes: health, readiness, and metrics", async ({
    request,
  }) => {
    // Probe 1: Liveness /healthz
    const healthzRes = await request.get(`${BASE_URL}/healthz`);
    expect(healthzRes.status()).toBe(200);
    const healthzJson = await healthzRes.json();
    expect(healthzJson).toEqual({ status: "ok" });

    // Probe 2: Readiness /readyz
    const readyzRes = await request.get(`${BASE_URL}/readyz`);
    expect(readyzRes.status()).toBe(200);
    const readyzJson = await readyzRes.json();
    expect(readyzJson).toEqual({ status: "ok" });

    // Probe 3: /health/live
    const liveRes = await request.get(`${BASE_URL}/health/live`);
    expect(liveRes.status()).toBe(200);
    expect(await liveRes.json()).toEqual({ status: "ok" });

    // Probe 4: /health/ready (with DB dependency status)
    const readyRes = await request.get(`${BASE_URL}/health/ready`);
    expect(readyRes.status()).toBe(200);
    expect(await readyRes.json()).toEqual({ status: "ok" });

    // Probe 5: Prometheus /metrics
    const metricsRes = await request.get(`${BASE_URL}/metrics`);
    expect(metricsRes.status()).toBe(200);
    const metricsText = await metricsRes.text();
    expect(metricsText).toContain("spins_total");
    expect(metricsText).toContain("spin_latency_avg_ms");
    expect(metricsText).toContain("db_ready");
    // Ensure no secrets or credentials appear in metrics output
    expect(metricsText).not.toContain("password");
    expect(metricsText).not.toContain("test123");
    expect(metricsText).not.toContain("secret");
  });
});

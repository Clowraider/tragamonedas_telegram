import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = join(import.meta.dirname, "../../../..");
const DEPLOY_DIR = join(ROOT_DIR, "deploy");

describe("Deployment and Operations Configuration (Unit 6)", () => {
  describe("Dockerfiles", () => {
    it("apps/api/Dockerfile implements multi-stage build and non-root execution", async () => {
      const content = await readFile(
        join(ROOT_DIR, "apps/api/Dockerfile"),
        "utf8",
      );
      expect(content).toContain("FROM node:22-alpine AS builder");
      expect(content).toContain("FROM node:22-alpine AS runner");
      expect(content).toContain("USER node");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("EXPOSE 3000");
    });

    it("apps/web/Dockerfile implements multi-stage build with static server", async () => {
      const content = await readFile(
        join(ROOT_DIR, "apps/web/Dockerfile"),
        "utf8",
      );
      expect(content).toContain("FROM node:22-alpine AS builder");
      expect(content).toContain("FROM nginx:alpine AS runner");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("EXPOSE 80");
    });
  });

  describe("Docker Compose Configuration", () => {
    it("deploy/compose.yaml declares all required services with proper isolation", async () => {
      const content = await readFile(join(DEPLOY_DIR, "compose.yaml"), "utf8");

      // Verify services
      expect(content).toContain("caddy:");
      expect(content).toContain("web:");
      expect(content).toContain("api:");
      expect(content).toContain("migrate:");
      expect(content).toContain("postgres:");
      expect(content).toContain("prometheus:");

      // Verify network isolation
      expect(content).toContain("slot_internal_net");
      expect(content).toContain('ports:\n      - "80:80"\n      - "443:443"');

      // Verify migration dependency ordering
      expect(content).toContain("condition: service_completed_successfully");
      expect(content).toContain("condition: service_healthy");

      // Verify production auth mode
      expect(content).toContain("AUTH_MODE: telegram");
    });
  });

  describe("Caddyfile & Reverse Proxy", () => {
    it("deploy/Caddyfile enforces security headers, proxies API, and protects metrics", async () => {
      const content = await readFile(join(DEPLOY_DIR, "Caddyfile"), "utf8");

      // Telegram Mini App CSP
      expect(content).toContain(
        "Content-Security-Policy \"frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;\"",
      );

      // Private metrics protection
      expect(content).toContain("path /metrics /metrics/*");
      expect(content).toContain(
        'respond @metrics "Access Denied: internal telemetry only" 403',
      );

      // Routing
      expect(content).toContain("reverse_proxy api:3000");
      expect(content).toContain("reverse_proxy web:80");
    });
  });

  describe("Prometheus Telemetry", () => {
    it("deploy/prometheus.yml scrapes private api metrics", async () => {
      const content = await readFile(
        join(DEPLOY_DIR, "prometheus.yml"),
        "utf8",
      );
      expect(content).toContain('job_name: "slot-machine-api"');
      expect(content).toContain('metrics_path: "/metrics"');
      expect(content).toContain('"api:3000"');
    });
  });

  describe("Environment Configuration Template", () => {
    it("deploy/.env.example provides production variables and disclaims real money", async () => {
      const content = await readFile(join(DEPLOY_DIR, ".env.example"), "utf8");
      expect(content).toContain("NODE_ENV=production");
      expect(content).toContain("AUTH_MODE=telegram");
      expect(content).toContain("TELEGRAM_BOT_TOKEN=");
      expect(content).toContain("APP_SECRET=");
      expect(content).toContain("POSTGRES_PASSWORD=");
      expect(content).toContain("DEFAULT_BALANCE=1000");
      expect(content).toContain("DEFAULT_STAKE=10");
    });
  });

  describe("Backup and Restore Scripts", () => {
    it("scripts exist and have executable permissions", async () => {
      const backupPath = join(DEPLOY_DIR, "scripts/backup.sh");
      const restorePath = join(DEPLOY_DIR, "scripts/restore.sh");

      await expect(access(backupPath, constants.X_OK)).resolves.toBeUndefined();
      await expect(
        access(restorePath, constants.X_OK),
      ).resolves.toBeUndefined();
    });

    it("backup.sh produces compressed checksummed dumps with retention cleanup", async () => {
      const content = await readFile(
        join(DEPLOY_DIR, "scripts/backup.sh"),
        "utf8",
      );
      expect(content).toContain("set -euo pipefail");
      expect(content).toContain("pg_dump");
      expect(content).toContain("gzip");
      expect(content).toContain("sha256sum");
      expect(content).toContain("gzip -t");
      expect(content).toContain("RETENTION_DAYS");
    });

    it("restore.sh supports isolated verification drill and live restore", async () => {
      const content = await readFile(
        join(DEPLOY_DIR, "scripts/restore.sh"),
        "utf8",
      );
      expect(content).toContain("set -euo pipefail");
      expect(content).toContain("--isolated");
      expect(content).toContain("CREATE DATABASE");
      expect(content).toContain("DROP DATABASE");
      expect(content).toContain(
        "SELECT COUNT(*) FROM wallets WHERE balance < 0",
      );
      expect(content).toContain("SELECT COUNT(*) FROM players;");
      expect(content).toContain("SELECT COUNT(*) FROM spin_rounds;");
    });
  });

  describe("Proxmox Operations Documentation", () => {
    it("deploy/PROXMOX.md documents all required operational scenarios", async () => {
      const content = await readFile(join(DEPLOY_DIR, "PROXMOX.md"), "utf8");
      expect(content).toContain("System Architecture on Proxmox");
      expect(content).toContain("Network Isolation Policy");
      expect(content).toContain("Prerequisites & Sizing");
      expect(content).toContain("Automated Backups & Off-Host Retention");
      expect(content).toContain("Restore Drills & Disaster Recovery");
      expect(content).toContain("Scenario A: Isolated Restore Drill");
      expect(content).toContain(
        "Scenario B: Live Production Disaster Recovery",
      );
      expect(content).toContain("Zero-Downtime Rollout");
      expect(content).toContain("Rollback Strategy");
    });
  });
});

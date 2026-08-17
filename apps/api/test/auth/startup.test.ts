import { describe, expect, it } from "vitest";

import { createAuthProvider } from "../../src/auth/index.js";
import { loadConfig, resolveDatabaseUrl } from "../../src/config.js";

const baseEnv = {
  DATABASE_URL: "postgresql://slot:slot@localhost:5432/slot_machine",
  APP_SECRET: "test-secret-do-not-use-in-production",
};

describe("Database Configuration Resolution", () => {
  it("uses DATABASE_URL when explicitly provided", () => {
    const url = resolveDatabaseUrl({
      DATABASE_URL: "postgresql://custom_user:custom_pass@db.example.com:5433/custom_db",
    });
    expect(url).toBe("postgresql://custom_user:custom_pass@db.example.com:5433/custom_db");
  });

  it("constructs database url from individual DB_* variables with URL encoding for password", () => {
    const url = resolveDatabaseUrl({
      DB_USER: "myuser",
      DB_PASSWORD: "p@ss#word/123",
      DB_HOST: "192.168.0.106",
      DB_PORT: "5432",
      DB_NAME: "tragamonedas_db",
    });
    expect(url).toBe("postgresql://myuser:p%40ss%23word%2F123@192.168.0.106:5432/tragamonedas_db");
  });

  it("supports POSTGRES_* fallback variables", () => {
    const url = resolveDatabaseUrl({
      POSTGRES_USER: "slot_admin",
      POSTGRES_PASSWORD: "secretpassword",
      POSTGRES_DB: "slot_prod",
    });
    expect(url).toBe("postgresql://slot_admin:secretpassword@localhost:5432/slot_prod");
  });

  it("loads config properly with discrete database variables", () => {
    const config = loadConfig({
      DB_USER: "slot",
      DB_PASSWORD: "secret",
      DB_NAME: "slot_db",
      APP_SECRET: "my-app-secret-12345678",
    });
    expect(config.databaseUrl).toBe("postgresql://slot:secret@localhost:5432/slot_db");
  });
});

describe("Production startup rejection", () => {
  it("refuses to create a development auth provider in production", () => {
    expect(() =>
      createAuthProvider(
        loadConfig({
          ...baseEnv,
          NODE_ENV: "production",
          AUTH_MODE: "development",
        }),
      ),
    ).toThrow();
  });

  it("allows a telegram auth provider in production with a token", () => {
    const provider = createAuthProvider(
      loadConfig({
        ...baseEnv,
        NODE_ENV: "production",
        AUTH_MODE: "telegram",
        TELEGRAM_BOT_TOKEN: "test-token",
      }),
    );
    expect(provider).toBeTypeOf("function");
  });
});

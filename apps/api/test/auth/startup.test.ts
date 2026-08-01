import { describe, expect, it } from "vitest";

import { createAuthProvider } from "../../src/auth/index.js";
import { loadConfig } from "../../src/config.js";

const baseEnv = {
  DATABASE_URL: "postgresql://slot:slot@localhost:5432/slot_machine",
  APP_SECRET: "test-secret-do-not-use-in-production",
};

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

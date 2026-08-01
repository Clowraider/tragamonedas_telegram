import { describe, expect, it } from "vitest";

import { createDevelopmentProvider } from "../../src/auth/development.js";

describe("Development identity isolation", () => {
  it("returns development identity when explicitly enabled", () => {
    const provider = createDevelopmentProvider({
      nodeEnv: "development",
      authMode: "development",
    });
    const identity = provider();
    expect(identity.provider).toBe("development");
    expect(identity.providerSubject).toBe("local-dev");
    expect(identity.displayLabel).toBe("development");
  });

  it("rejects development identity in production", () => {
    expect(() =>
      createDevelopmentProvider({
        nodeEnv: "production",
        authMode: "development",
      }),
    ).toThrow();
  });

  it("rejects development identity when auth mode is not development", () => {
    expect(() =>
      createDevelopmentProvider({
        nodeEnv: "development",
        authMode: "telegram",
      }),
    ).toThrow();
  });
});

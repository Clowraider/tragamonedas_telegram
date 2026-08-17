import type { AppConfig } from "../config.js";
import type { Identity } from "./types.js";

export type DevelopmentAuthConfig = Pick<AppConfig, "nodeEnv" | "authMode">;

export function createDevelopmentProvider(
  config: DevelopmentAuthConfig,
): () => Identity {
  const enabled =
    config.nodeEnv === "development" && config.authMode === "development";
  if (!enabled) {
    throw new Error(
      "Development identity is only available in local development mode",
    );
  }
  return () => ({
    provider: "development",
    providerSubject: "local-dev",
    displayLabel: "development",
    username: "dev_player",
    firstName: "Dev",
  });
}

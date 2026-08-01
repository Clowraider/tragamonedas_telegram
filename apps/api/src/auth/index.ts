import type { AppConfig } from "../config.js";
import { createDevelopmentProvider } from "./development.js";
import { telegramIdentity, validateTelegramInitData } from "./telegram.js";
import type { Identity } from "./types.js";

export type { Identity };

export type AuthProvider = (initData: string) => Identity;

export function createAuthProvider(config: AppConfig): AuthProvider {
  if (config.authMode === "development") {
    return createDevelopmentProvider(config);
  }

  if (config.authMode === "telegram") {
    return (initData: string) => {
      const result = validateTelegramInitData(
        initData,
        config.telegramBotToken ?? "",
        config.authDateMaxAgeSeconds,
      );
      return telegramIdentity(result);
    };
  }

  throw new Error(`Unsupported auth mode: ${config.authMode}`);
}

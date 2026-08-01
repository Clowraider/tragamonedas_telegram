import { createHmac, timingSafeEqual } from "node:crypto";

import type { Identity } from "./types.js";

export type TelegramValidationResult = {
  telegramUserId: string;
};

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): TelegramValidationResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Missing Telegram hash");
  }
  params.delete("hash");

  const sortedKeys = [...params.keys()].sort();
  const dataCheckString = sortedKeys
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))) {
    throw new Error("Invalid Telegram hash");
  }

  const authDate = params.get("auth_date");
  if (!authDate) {
    throw new Error("Missing Telegram auth_date");
  }
  const authDateSeconds = Number.parseInt(authDate, 10);
  if (Number.isNaN(authDateSeconds)) {
    throw new Error("Invalid Telegram auth_date");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw new Error("Telegram auth_date is too old");
  }

  const userJson = params.get("user");
  if (!userJson) {
    throw new Error("Missing Telegram user");
  }
  const user = JSON.parse(userJson) as { id?: unknown };
  if (typeof user.id !== "number" || user.id <= 0) {
    throw new Error("Invalid Telegram user id");
  }

  return { telegramUserId: String(user.id) };
}

export function telegramIdentity(result: TelegramValidationResult): Identity {
  return {
    provider: "telegram",
    providerSubject: result.telegramUserId,
    displayLabel: "telegram",
  };
}

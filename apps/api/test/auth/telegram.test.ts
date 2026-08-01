import { randomBytes, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { validateTelegramInitData } from "../../src/auth/telegram.js";

function makeInitData(
  params: Record<string, string>,
  botToken: string,
): string {
  const sortedEntries = Object.entries(params).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const dataCheckString = sortedEntries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const usp = new URLSearchParams(params);
  usp.set("hash", hash);
  return usp.toString();
}

describe("Telegram identity validation", () => {
  const botToken = randomBytes(16).toString("hex");
  const maxAge = 3600;

  it("accepts authentic recent launch data", () => {
    const user = JSON.stringify({ id: 123456 });
    const authDate = String(Math.floor(Date.now() / 1000));
    const initData = makeInitData({ user, auth_date: authDate }, botToken);
    const result = validateTelegramInitData(initData, botToken, maxAge);
    expect(result.telegramUserId).toBe("123456");
  });

  it("rejects missing hash", () => {
    const user = JSON.stringify({ id: 123456 });
    const authDate = String(Math.floor(Date.now() / 1000));
    const params = new URLSearchParams({ user, auth_date: authDate });
    expect(() =>
      validateTelegramInitData(params.toString(), botToken, maxAge),
    ).toThrow();
  });

  it("rejects altered data", () => {
    const user = JSON.stringify({ id: 123456 });
    const authDate = String(Math.floor(Date.now() / 1000));
    const initData = makeInitData({ user, auth_date: authDate }, botToken);
    const tampered = initData.replace("123456", "999999");
    expect(() =>
      validateTelegramInitData(tampered, botToken, maxAge),
    ).toThrow();
  });

  it("rejects expired auth_date", () => {
    const user = JSON.stringify({ id: 123456 });
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - maxAge - 10);
    const initData = makeInitData({ user, auth_date: oldAuthDate }, botToken);
    expect(() =>
      validateTelegramInitData(initData, botToken, maxAge),
    ).toThrow();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTelegramWebApp,
  getTelegramInitData,
  isTelegramEnvironment,
  initTelegramApp,
  triggerHaptic,
  type TelegramWebApp,
} from "../src/telegram.js";

describe("telegram adapter", () => {
  beforeEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when Telegram WebApp is not present on window", () => {
    expect(getTelegramWebApp()).toBeNull();
    expect(getTelegramInitData()).toBeNull();
    expect(isTelegramEnvironment()).toBe(false);
  });

  it("extracts initData directly from window.Telegram.WebApp", () => {
    const mockWebApp: Partial<TelegramWebApp> = {
      initData:
        "query_id=AAHd&user=%7B%22id%22%3A123%7D&auth_date=1722000000&hash=abc",
      platform: "tdesktop",
    };

    window.Telegram = { WebApp: mockWebApp as TelegramWebApp };

    expect(getTelegramWebApp()).toBe(mockWebApp);
    expect(getTelegramInitData()).toBe(
      "query_id=AAHd&user=%7B%22id%22%3A123%7D&auth_date=1722000000&hash=abc",
    );
    expect(isTelegramEnvironment()).toBe(true);
  });

  it("safely calls ready() and expand() when WebApp exists", () => {
    const ready = vi.fn();
    const expand = vi.fn();

    window.Telegram = {
      WebApp: {
        ready,
        expand,
      } as unknown as TelegramWebApp,
    };

    initTelegramApp();
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });

  it("no-ops safely during initTelegramApp when WebApp is missing", () => {
    expect(() => initTelegramApp()).not.toThrow();
  });

  it("triggers haptic feedback when available", () => {
    const impactOccurred = vi.fn();
    const notificationOccurred = vi.fn();

    window.Telegram = {
      WebApp: {
        HapticFeedback: {
          impactOccurred,
          notificationOccurred,
          selectionChanged: vi.fn(),
        },
      } as unknown as TelegramWebApp,
    };

    triggerHaptic("impact", "medium");
    expect(impactOccurred).toHaveBeenCalledWith("medium");

    triggerHaptic("win");
    expect(notificationOccurred).toHaveBeenCalledWith("success");

    triggerHaptic("error");
    expect(notificationOccurred).toHaveBeenCalledWith("error");
  });

  it("no-ops safely during triggerHaptic when HapticFeedback is missing", () => {
    expect(() => triggerHaptic("impact")).not.toThrow();
    expect(() => triggerHaptic("win")).not.toThrow();
    expect(() => triggerHaptic("error")).not.toThrow();
  });
});

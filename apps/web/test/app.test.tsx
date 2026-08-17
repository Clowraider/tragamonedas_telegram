// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { App } from "../src/app.js";
import type { TelegramWebApp } from "../src/telegram.js";

describe("App component", () => {
  beforeEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders development badge when running outside Telegram", () => {
    render(<App />);

    expect(screen.getByTestId("dev-badge")).toBeDefined();
    expect(screen.getByTestId("no-cash-value-disclaimer")).toBeDefined();
  });

  it("hides development badge when running inside Telegram environment", () => {
    const ready = vi.fn();
    const expand = vi.fn();

    window.Telegram = {
      WebApp: {
        initData: "query_id=AAHd&user=%7B%22id%22%3A123%7D",
        ready,
        expand,
      } as unknown as TelegramWebApp,
    };

    render(<App />);

    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("dev-badge")).toBeNull();
    expect(screen.getByTestId("no-cash-value-disclaimer")).toBeDefined();
  });

  it("honors explicit isDevMode prop override", () => {
    render(<App isDevMode={false} />);
    expect(screen.queryByTestId("dev-badge")).toBeNull();

    cleanup();

    render(<App isDevMode={true} />);
    expect(screen.getByTestId("dev-badge")).toBeDefined();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import type { UseSpinResult } from "../src/slot/useSpin.js";
import { SlotMachine } from "../src/slot/SlotMachine.js";
import { ApiClientError } from "../src/api.js";

describe("SlotMachine component", () => {
  afterEach(() => {
    cleanup();
  });

  const createMockHook = (
    overrides: Partial<UseSpinResult> = {},
  ): UseSpinResult => ({
    state: "ready",
    balance: 1000,
    stake: 10,
    gameVersion: "classic-1",
    playerId: "p-test",
    symbols: ["seven", "seven", "seven"],
    reelSpinning: [false, false, false],
    lastRound: null,
    payout: 0,
    error: null,
    pendingKey: null,
    isReducedMotion: false,
    canSpin: true,
    isAutoSpinning: false,
    autoSpinRemaining: 0,
    setStake: vi.fn(),
    startAutoSpin: vi.fn(),
    stopAutoSpin: vi.fn(),
    spin: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    setReducedMotion: vi.fn(),
    toggleReducedMotion: vi.fn(),
    onAnimationComplete: vi.fn(),
    ...overrides,
  });

  it("renders exactly three reels and one central payline indicator", () => {
    const hook = createMockHook();
    render(<SlotMachine spinHook={hook} />);

    expect(screen.getByTestId("reel-0")).toBeDefined();
    expect(screen.getByTestId("reel-1")).toBeDefined();
    expect(screen.getByTestId("reel-2")).toBeDefined();
    expect(screen.queryByTestId("reel-3")).toBeNull();

    expect(screen.getByTestId("central-payline")).toBeDefined();
    expect(screen.getByTestId("reels-wrapper")).toBeDefined();
  });

  it("persistently displays virtual credits and no-cash-value disclaimer", () => {
    const hook = createMockHook({ balance: 750, stake: 10 });
    render(<SlotMachine spinHook={hook} />);

    const disclaimer = screen.getByTestId("no-cash-value-disclaimer");
    expect(disclaimer.textContent).toContain("No Real Cash Value");
    expect(disclaimer.textContent).toContain("Virtual Credits Only");

    const balanceDisplay = screen.getByTestId("balance-display");
    expect(balanceDisplay.textContent).toBe("750 Credits");
  });

  it("strictly contains NO value-bearing controls (no deposit, withdraw, cash-out, purchase, or token swap)", () => {
    const hook = createMockHook();
    const { container } = render(<SlotMachine spinHook={hook} />);

    const textContent = container.textContent?.toLowerCase() ?? "";
    expect(textContent).not.toContain("deposit");
    expect(textContent).not.toContain("withdraw");
    expect(textContent).not.toContain("cash out");
    expect(textContent).not.toContain("cashout");
    expect(textContent).not.toContain("buy credits");
    expect(textContent).not.toContain("purchase");
    expect(textContent).not.toContain("transfer");
    expect(textContent).not.toContain("wallet connect");

    // Only expected buttons exist
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      const label = btn.textContent?.toLowerCase() ?? "";
      expect([
        "spin",
        "retry last spin (recover)",
        "refresh balance",
        "🔊 sound on",
        "🔇 muted",
        "10",
        "20",
        "25",
        "50",
        "100",
        "∞",
      ]).toContain(label.trim());
    }
  });

  it("provides accessible semantic structure and ARIA live regions", () => {
    const hook = createMockHook({
      symbols: ["cherry", "lemon", "seven"],
    });
    render(<SlotMachine spinHook={hook} />);

    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("region", { name: /slot reels/i })).toBeDefined();

    // Reels are individually labelled with their symbol
    expect(
      screen.getByRole("group", { name: /Reel 1: Cherry/i }),
    ).toBeDefined();
    expect(screen.getByRole("group", { name: /Reel 2: Lemon/i })).toBeDefined();
    expect(screen.getByRole("group", { name: /Reel 3: Seven/i })).toBeDefined();

    // Announcement area with aria-live
    const announcementArea = screen.getByTestId("announcement-area");
    expect(announcementArea.getAttribute("aria-live")).toBe("polite");
  });

  it("displays development mode badge when isDevelopmentMode is true", () => {
    const hook = createMockHook();
    const { rerender } = render(
      <SlotMachine spinHook={hook} isDevelopmentMode={true} />,
    );

    expect(screen.getByTestId("dev-badge")).toBeDefined();
    expect(screen.getByTestId("dev-badge").textContent).toBe(
      "Development Mode",
    );

    rerender(<SlotMachine spinHook={hook} isDevelopmentMode={false} />);
    expect(screen.queryByTestId("dev-badge")).toBeNull();
  });

  it("announces win payout with multiplier when settled with payout > 0", () => {
    const hook = createMockHook({
      state: "settled",
      payout: 500,
      stake: 10,
      lastRound: {
        roundId: "r-001",
        status: "settled",
        symbols: ["seven", "seven", "seven"],
        stake: 10,
        payout: 500,
        balanceBefore: 500,
        balanceAfter: 990,
        gameVersion: "classic-1",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    });

    render(<SlotMachine spinHook={hook} />);

    const banner = screen.getByTestId("outcome-banner");
    expect(banner.textContent).toContain("WIN! +500 Virtual Credits");
    expect(banner.textContent).toContain("Multiplier: 50x");
  });

  it("renders retry button and triggers same-key retry on error", () => {
    const retryFn = vi.fn().mockResolvedValue(undefined);
    const hook = createMockHook({
      state: "error",
      pendingKey: "c0000000-0000-0000-0000-000000000001",
      error: new ApiClientError(
        "INTERNAL_ERROR",
        "Network error during spin",
        "req-1",
        500,
      ),
      retry: retryFn,
    });

    render(<SlotMachine spinHook={hook} />);

    expect(screen.getByTestId("error-banner").textContent).toContain(
      "Network error during spin",
    );

    const retryButton = screen.getByTestId("retry-button");
    expect(retryButton).toBeDefined();

    fireEvent.click(retryButton);
    expect(retryFn).toHaveBeenCalledOnce();
  });

  it("supports toggling reduced motion preference", () => {
    const toggleReducedMotion = vi.fn();
    const hook = createMockHook({
      isReducedMotion: false,
      toggleReducedMotion,
    });

    render(<SlotMachine spinHook={hook} />);

    const checkbox = screen.getByTestId("reduced-motion-toggle");
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect(toggleReducedMotion).toHaveBeenCalledOnce();
  });

  it("handles auto-spin triggers and stop button", () => {
    const startAutoSpin = vi.fn();
    const stopAutoSpin = vi.fn();

    const hook = createMockHook({
      isAutoSpinning: false,
      startAutoSpin,
      stopAutoSpin,
    });

    const { rerender } = render(<SlotMachine spinHook={hook} />);

    const auto10Btn = screen.getByTestId("autospin-10");
    fireEvent.click(auto10Btn);
    expect(startAutoSpin).toHaveBeenCalledWith(10);

    const autoInfBtn = screen.getByTestId("autospin-inf");
    fireEvent.click(autoInfBtn);
    expect(startAutoSpin).toHaveBeenCalledWith("infinity");

    // Rerender in active auto-spin state
    rerender(
      <SlotMachine
        spinHook={createMockHook({
          isAutoSpinning: true,
          autoSpinRemaining: 9,
          startAutoSpin,
          stopAutoSpin,
        })}
      />,
    );

    const stopButton = screen.getByTestId("auto-stop-button");
    expect(stopButton.textContent).toContain("STOP AUTO (9)");
    fireEvent.click(stopButton);
    expect(stopAutoSpin).toHaveBeenCalledOnce();
  });

  it("handles stake change via pill buttons", () => {
    const setStake = vi.fn();
    const hook = createMockHook({
      balance: 500,
      stake: 10,
      setStake,
    });

    render(<SlotMachine spinHook={hook} />);

    const pill50 = screen.getByTestId("stake-pill-50");
    fireEvent.click(pill50);
    expect(setStake).toHaveBeenCalledWith(50);
  });
});

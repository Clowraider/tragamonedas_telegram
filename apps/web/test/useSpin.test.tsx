// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type {
  PlayerSnapshot,
  SpinRepresentation,
} from "@slot-machine/contracts";

import { useSpin } from "../src/slot/useSpin.js";
import { ApiClient, ApiClientError } from "../src/api.js";

describe("useSpin hook", () => {
  const mockSnapshot: PlayerSnapshot = {
    playerId: "p-001",
    balance: 500,
    stake: 10,
    gameVersion: "classic-1",
    recentRound: null,
  };

  const mockSpinWin: SpinRepresentation = {
    roundId: "r-001",
    status: "settled",
    symbols: ["bar", "bar", "bar"],
    stake: 10,
    payout: 200,
    balanceBefore: 500,
    balanceAfter: 690,
    gameVersion: "classic-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  };

  const mockSpinLoss: SpinRepresentation = {
    roundId: "r-002",
    status: "settled",
    symbols: ["lemon", "cherry", "bell"],
    stake: 10,
    payout: 0,
    balanceBefore: 690,
    balanceAfter: 680,
    gameVersion: "classic-1",
    createdAt: "2026-08-01T00:01:00.000Z",
  };

  let mockClient: ApiClient;
  let getMeMock: ReturnType<typeof vi.fn>;
  let spinMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    getMeMock = vi.fn().mockResolvedValue(mockSnapshot);
    spinMock = vi.fn().mockResolvedValue(mockSpinWin);

    mockClient = {
      getMe: getMeMock,
      spin: spinMock,
      getRound: vi.fn(),
      getHistory: vi.fn(),
    } as unknown as ApiClient;
  });

  it("boots and fetches initial player snapshot", async () => {
    const { result } = renderHook(() =>
      useSpin({ apiClient: mockClient, autoLoad: true }),
    );

    expect(result.current.state).toBe("booting");

    await waitFor(() => {
      expect(result.current.state).toBe("ready");
    });

    expect(result.current.balance).toBe(500);
    expect(result.current.stake).toBe(10);
    expect(result.current.playerId).toBe("p-001");
    expect(result.current.canSpin).toBe(true);
  });

  it("resolves reels ONLY to authoritative server symbols after animation", async () => {
    const { result } = renderHook(() =>
      useSpin({
        apiClient: mockClient,
        autoLoad: true,
        initialReducedMotion: false,
        animationDurationMs: 1000,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe("ready"));

    // Trigger spin
    let spinPromise: Promise<void>;
    act(() => {
      spinPromise = result.current.spin();
    });

    // In requesting state
    expect(result.current.state).toBe("requesting");
    expect(result.current.canSpin).toBe(false);

    await act(async () => {
      await spinPromise;
    });

    // In animating state
    expect(result.current.state).toBe("animating");

    // Advance past animation duration
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.state).toBe("settled");
    expect(result.current.symbols).toEqual(["bar", "bar", "bar"]);
    expect(result.current.balance).toBe(690);
    expect(result.current.payout).toBe(200);
    expect(result.current.lastRound).toEqual(mockSpinWin);
  });

  it("settles instantly without animation when reduced motion is preferred", async () => {
    const { result } = renderHook(() =>
      useSpin({
        apiClient: mockClient,
        autoLoad: true,
        initialReducedMotion: true,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.spin();
    });

    // Settled immediately with authoritative outcome
    expect(result.current.state).toBe("settled");
    expect(result.current.symbols).toEqual(["bar", "bar", "bar"]);
    expect(result.current.balance).toBe(690);
    expect(result.current.payout).toBe(200);
  });

  it("guards against repeated input while spin is in progress", async () => {
    let resolveSpin: (value: SpinRepresentation) => void;
    const delayedSpinPromise = new Promise<SpinRepresentation>((res) => {
      resolveSpin = res;
    });
    spinMock.mockReturnValueOnce(delayedSpinPromise);

    const { result } = renderHook(() =>
      useSpin({ apiClient: mockClient, autoLoad: true }),
    );

    await waitFor(() => expect(result.current.state).toBe("ready"));

    act(() => {
      void result.current.spin();
    });

    expect(result.current.state).toBe("requesting");
    expect(spinMock).toHaveBeenCalledTimes(1);

    // Repeated click during requesting
    act(() => {
      void result.current.spin();
    });
    // Second click should be ignored
    expect(spinMock).toHaveBeenCalledTimes(1);

    // Now resolve backend response
    await act(async () => {
      resolveSpin!(mockSpinLoss);
    });

    expect(result.current.state).toBe("animating");

    // Repeated click during animating
    act(() => {
      void result.current.spin();
    });
    expect(spinMock).toHaveBeenCalledTimes(1);

    // Finish animation
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.state).toBe("settled");
    expect(result.current.symbols).toEqual(["lemon", "cherry", "bell"]);
    expect(result.current.balance).toBe(680);
  });

  it("recovers with the SAME idempotency key after lost/failed response", async () => {
    // 1st call fails with network error
    spinMock.mockRejectedValueOnce(new Error("Network connection timeout"));

    const { result } = renderHook(() =>
      useSpin({
        apiClient: mockClient,
        autoLoad: true,
        initialReducedMotion: true,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe("ready"));

    await act(async () => {
      await result.current.spin();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error?.message).toBe("Network connection timeout");
    const recordedKey = result.current.pendingKey;
    expect(recordedKey).toBeTruthy();
    expect(spinMock).toHaveBeenCalledTimes(1);

    const initialKey = spinMock.mock.calls[0][0].idempotencyKey;
    expect(initialKey).toBe(recordedKey);

    // 2nd call via retry() reuses the SAME key
    spinMock.mockResolvedValueOnce(mockSpinWin);

    await act(async () => {
      await result.current.retry();
    });

    expect(spinMock).toHaveBeenCalledTimes(2);
    const retryKey = spinMock.mock.calls[1][0].idempotencyKey;
    expect(retryKey).toBe(initialKey);

    expect(result.current.state).toBe("settled");
    expect(result.current.symbols).toEqual(["bar", "bar", "bar"]);
    expect(result.current.balance).toBe(690);
  });

  it("prevents spin when balance is below stake", async () => {
    getMeMock.mockResolvedValueOnce({
      ...mockSnapshot,
      balance: 5,
      stake: 10,
    });

    const { result } = renderHook(() =>
      useSpin({ apiClient: mockClient, autoLoad: true }),
    );

    await waitFor(() => expect(result.current.state).toBe("ready"));

    expect(result.current.balance).toBe(5);
    expect(result.current.canSpin).toBe(false);

    await act(async () => {
      await result.current.spin();
    });

    expect(spinMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBeInstanceOf(ApiClientError);
    expect((result.current.error as ApiClientError).code).toBe(
      "INSUFFICIENT_CREDITS",
    );
  });
});

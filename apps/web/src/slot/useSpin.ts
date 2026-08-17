import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PlayerSnapshot,
  SlotSymbol,
  SpinRepresentation,
} from "@slot-machine/contracts";

import { ApiClient, ApiClientError, defaultApiClient } from "../api.js";
import { triggerHaptic } from "../telegram.js";
import { generateUUID } from "../uuid.js";

export type SpinState =
  "booting" | "ready" | "requesting" | "animating" | "settled" | "error";

export const DEFAULT_SYMBOLS: readonly [SlotSymbol, SlotSymbol, SlotSymbol] = [
  "seven",
  "seven",
  "seven",
] as const;

export const ANIMATION_DURATION_MS = 1200;

export interface UseSpinOptions {
  apiClient?: ApiClient | undefined;
  autoLoad?: boolean | undefined;
  initialReducedMotion?: boolean | undefined;
  animationDurationMs?: number | undefined;
}

export interface UseSpinResult {
  state: SpinState;
  balance: number;
  stake: number;
  gameVersion: string;
  playerId: string | null;
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  lastRound: SpinRepresentation | null;
  payout: number;
  error: ApiClientError | Error | null;
  pendingKey: string | null;
  isReducedMotion: boolean;
  canSpin: boolean;
  spin: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  setReducedMotion: (reduced: boolean) => void;
  toggleReducedMotion: () => void;
  onAnimationComplete: () => void;
}

export function useSpin(options: UseSpinOptions = {}): UseSpinResult {
  const {
    apiClient = defaultApiClient,
    autoLoad = true,
    initialReducedMotion,
    animationDurationMs = ANIMATION_DURATION_MS,
  } = options;

  const [state, setState] = useState<SpinState>("booting");
  const [balance, setBalance] = useState<number>(0);
  const [stake, setStake] = useState<number>(10);
  const [gameVersion, setGameVersion] = useState<string>("classic-1");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<[SlotSymbol, SlotSymbol, SlotSymbol]>([
    ...DEFAULT_SYMBOLS,
  ]);
  const [lastRound, setLastRound] = useState<SpinRepresentation | null>(null);
  const [payout, setPayout] = useState<number>(0);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // Reduced motion preference
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(() => {
    if (typeof initialReducedMotion === "boolean") {
      return initialReducedMotion;
    }
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  const pendingResultRef = useRef<SpinRepresentation | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  // Sync reduced motion changes from media query
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      if (initialReducedMotion === undefined) {
        setIsReducedMotion(e.matches);
      }
    };

    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
  }, [initialReducedMotion]);

  // Clean up animation timer
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  const applySnapshot = useCallback((snapshot: PlayerSnapshot) => {
    setBalance(snapshot.balance);
    setStake(snapshot.stake);
    setGameVersion(snapshot.gameVersion);
    setPlayerId(snapshot.playerId);

    if (snapshot.recentRound) {
      setLastRound(snapshot.recentRound);
      setSymbols([...snapshot.recentRound.symbols]);
      setPayout(snapshot.recentRound.payout);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const snapshot = await apiClient.getMe();
      applySnapshot(snapshot);
      setState("ready");
    } catch (err) {
      const formattedErr = err instanceof Error ? err : new Error(String(err));
      setError(formattedErr);
      setState("error");
    }
  }, [apiClient, applySnapshot]);

  // Initial load
  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  const settleSpin = useCallback((result: SpinRepresentation) => {
    setSymbols([...result.symbols]);
    setBalance(result.balanceAfter);
    setPayout(result.payout);
    setLastRound(result);
    setState("settled");
    setPendingKey(null);
    pendingResultRef.current = null;
    inFlightRef.current = false;

    if (result.payout > 0) {
      triggerHaptic("win");
    }
  }, []);

  const onAnimationComplete = useCallback(() => {
    if (pendingResultRef.current) {
      settleSpin(pendingResultRef.current);
    }
  }, [settleSpin]);

  const executeSpinWithKey = useCallback(
    async (idempotencyKey: string) => {
      // Prevent repeated input during spin
      if (
        inFlightRef.current ||
        state === "requesting" ||
        state === "animating"
      ) {
        return;
      }

      if (balance < stake) {
        const insFundsErr = new ApiClientError(
          "INSUFFICIENT_CREDITS",
          "Insufficient virtual credits to place spin",
          generateUUID(),
          422,
        );
        setError(insFundsErr);
        setState("error");
        triggerHaptic("error");
        return;
      }

      inFlightRef.current = true;
      setPendingKey(idempotencyKey);
      setError(null);
      setState("requesting");
      triggerHaptic("impact", "light");

      try {
        const result = await apiClient.spin({
          idempotencyKey,
          stake,
          gameVersion,
        });

        pendingResultRef.current = result;

        if (isReducedMotion) {
          // Instant settlement with no animation
          settleSpin(result);
        } else {
          // Animate reels
          setState("animating");
          if (animationTimerRef.current) {
            clearTimeout(animationTimerRef.current);
          }
          animationTimerRef.current = setTimeout(() => {
            settleSpin(result);
          }, animationDurationMs);
        }
      } catch (err) {
        inFlightRef.current = false;
        const formattedErr =
          err instanceof Error ? err : new Error(String(err));
        setError(formattedErr);
        setState("error");
        triggerHaptic("error");
        // Note: pendingKey is retained so retry can use the same key!
      }
    },
    [
      state,
      balance,
      stake,
      gameVersion,
      apiClient,
      isReducedMotion,
      animationDurationMs,
      settleSpin,
    ],
  );

  const spin = useCallback(async () => {
    const newKey = generateUUID();
    await executeSpinWithKey(newKey);
  }, [executeSpinWithKey]);

  const retry = useCallback(async () => {
    if (pendingKey) {
      await executeSpinWithKey(pendingKey);
    } else {
      await spin();
    }
  }, [pendingKey, executeSpinWithKey, spin]);

  const canSpin =
    state !== "booting" &&
    state !== "requesting" &&
    state !== "animating" &&
    balance >= stake;

  const toggleReducedMotion = useCallback(() => {
    setIsReducedMotion((prev) => !prev);
  }, []);

  return {
    state,
    balance,
    stake,
    gameVersion,
    playerId,
    symbols,
    lastRound,
    payout,
    error,
    pendingKey,
    isReducedMotion,
    canSpin,
    spin,
    retry,
    refresh,
    setReducedMotion: setIsReducedMotion,
    toggleReducedMotion,
    onAnimationComplete,
  };
}

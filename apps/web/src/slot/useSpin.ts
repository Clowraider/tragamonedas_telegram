import { useState, useEffect, useCallback, useRef } from "react";
import type {
  PlayerSnapshot,
  SlotSymbol,
  SpinRepresentation,
} from "@slot-machine/contracts";

import { ApiClient, ApiClientError, defaultApiClient } from "../api.js";
import { triggerHaptic } from "../telegram.js";
import { generateUUID } from "../uuid.js";
import { playSound } from "../sound.js";

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
  setStake: (newStake: number) => void;
  gameVersion: string;
  playerId: string | null;
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  reelSpinning: [boolean, boolean, boolean];
  lastRound: SpinRepresentation | null;
  payout: number;
  error: ApiClientError | Error | null;
  pendingKey: string | null;
  isReducedMotion: boolean;
  canSpin: boolean;
  isAutoSpinning: boolean;
  autoSpinRemaining: number | "infinity";
  startAutoSpin: (count: number | "infinity") => void;
  stopAutoSpin: () => void;
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
  const [reelSpinning, setReelSpinning] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [lastRound, setLastRound] = useState<SpinRepresentation | null>(null);
  const [payout, setPayout] = useState<number>(0);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isAutoSpinning, setIsAutoSpinning] = useState<boolean>(false);
  const [autoSpinRemaining, setAutoSpinRemaining] = useState<
    number | "infinity"
  >(0);

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
  const reelTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autoSpinTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inFlightRef = useRef<boolean>(false);
  const autoSpinStateRef = useRef<{
    active: boolean;
    remaining: number | "infinity";
  }>({
    active: false,
    remaining: 0,
  });

  const clearAutoSpinTimer = useCallback(() => {
    if (autoSpinTimerRef.current.length > 0) {
      for (const t of autoSpinTimerRef.current) {
        clearTimeout(t);
      }
      autoSpinTimerRef.current = [];
    }
  }, []);

  const stopAutoSpin = useCallback(() => {
    autoSpinStateRef.current = { active: false, remaining: 0 };
    setIsAutoSpinning(false);
    setAutoSpinRemaining(0);
    clearAutoSpinTimer();
  }, [clearAutoSpinTimer]);

  const clearReelTimers = useCallback(() => {
    if (reelTimersRef.current.length > 0) {
      for (const timer of reelTimersRef.current) {
        clearTimeout(timer);
      }
      reelTimersRef.current = [];
    }
  }, []);

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

  // Clean up animation timers
  useEffect(() => {
    return () => {
      clearReelTimers();
    };
  }, [clearReelTimers]);

  const applySnapshot = useCallback((snapshot: PlayerSnapshot) => {
    setBalance(snapshot.balance);
    setStake(snapshot.stake);
    setGameVersion(snapshot.gameVersion);
    setPlayerId(snapshot.playerId);
    setReelSpinning([false, false, false]);

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
    setReelSpinning([false, false, false]);
    pendingResultRef.current = null;
    inFlightRef.current = false;

    if (result.payout > 0) {
      triggerHaptic("win");
      // Jackpot for top multiplier (e.g. 100x / 1000 credits or 3 matching sevens)
      if (result.payout >= result.stake * 50) {
        playSound("win_jackpot");
      } else {
        playSound("win_small");
      }
    }
  }, []);

  const onAnimationComplete = useCallback(() => {
    clearReelTimers();
    setReelSpinning([false, false, false]);
    if (pendingResultRef.current) {
      settleSpin(pendingResultRef.current);
    }
  }, [clearReelTimers, settleSpin]);

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
        stopAutoSpin();
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
      setReelSpinning([true, true, true]);
      triggerHaptic("impact", "light");
      playSound("lever");

      try {
        const result = await apiClient.spin({
          idempotencyKey,
          stake,
          gameVersion,
        });

        pendingResultRef.current = result;

        const handleNextAutoStep = (res: SpinRepresentation) => {
          settleSpin(res);

          // Stop on Win rule or decrement auto-spins
          if (res.payout > 0) {
            stopAutoSpin();
            return;
          }

          if (autoSpinStateRef.current.active) {
            let nextRemaining = autoSpinStateRef.current.remaining;
            if (typeof nextRemaining === "number") {
              nextRemaining -= 1;
              autoSpinStateRef.current.remaining = nextRemaining;
              setAutoSpinRemaining(nextRemaining);
              if (nextRemaining <= 0) {
                stopAutoSpin();
                return;
              }
            }

            // Schedule next spin if balance is sufficient
            if (res.balanceAfter >= stake) {
              const autoTimer = setTimeout(() => {
                if (autoSpinStateRef.current.active) {
                  const nextKey = generateUUID();
                  void executeSpinWithKey(nextKey);
                }
              }, 700);
              autoSpinTimerRef.current = [autoTimer];
            } else {
              stopAutoSpin();
            }
          }
        };

        if (isReducedMotion) {
          // Instant settlement with no animation
          setReelSpinning([false, false, false]);
          handleNextAutoStep(result);
        } else {
          // Animate reels sequentially
          setState("animating");
          clearReelTimers();

          const t0 = Math.max(100, Math.round(animationDurationMs * 0.5));
          const t1 = Math.max(t0 + 50, Math.round(animationDurationMs * 0.75));
          const t2 = animationDurationMs;

          const timer0 = setTimeout(() => {
            setReelSpinning([false, true, true]);
            setSymbols((prev) => [result.symbols[0], prev[1], prev[2]]);
            triggerHaptic("impact", "light");
            playSound("reel_stop");
          }, t0);

          const timer1 = setTimeout(() => {
            setReelSpinning([false, false, true]);
            setSymbols((prev) => [result.symbols[0], result.symbols[1], prev[2]]);
            triggerHaptic("impact", "light");
            playSound("reel_stop");
          }, t1);

          const timer2 = setTimeout(() => {
            setReelSpinning([false, false, false]);
            playSound("reel_stop");
            handleNextAutoStep(result);
          }, t2);

          reelTimersRef.current = [timer0, timer1, timer2];
        }
      } catch (err) {
        stopAutoSpin();
        inFlightRef.current = false;
        clearReelTimers();
        setReelSpinning([false, false, false]);
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
      clearReelTimers,
      settleSpin,
      stopAutoSpin,
    ],
  );

  const spin = useCallback(async () => {
    stopAutoSpin();
    const newKey = generateUUID();
    await executeSpinWithKey(newKey);
  }, [stopAutoSpin, executeSpinWithKey]);

  const startAutoSpin = useCallback(
    (count: number | "infinity") => {
      clearAutoSpinTimer();
      autoSpinStateRef.current = { active: true, remaining: count };
      setIsAutoSpinning(true);
      setAutoSpinRemaining(count);
      const newKey = generateUUID();
      void executeSpinWithKey(newKey);
    },
    [clearAutoSpinTimer, executeSpinWithKey],
  );

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
    setStake,
    gameVersion,
    playerId,
    symbols,
    reelSpinning,
    lastRound,
    payout,
    error,
    pendingKey,
    isReducedMotion,
    canSpin,
    isAutoSpinning,
    autoSpinRemaining,
    startAutoSpin,
    stopAutoSpin,
    spin,
    retry,
    refresh,
    setReducedMotion: setIsReducedMotion,
    toggleReducedMotion,
    onAnimationComplete,
  };
}

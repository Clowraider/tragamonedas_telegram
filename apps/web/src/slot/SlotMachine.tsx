import React, { useEffect, useState } from "react";
import type { SlotSymbol, SpinRepresentation } from "@slot-machine/contracts";

import { useSpin, type UseSpinResult } from "./useSpin.js";
import { ApiClient } from "../api.js";

export const SYMBOL_CONFIG: Record<
  SlotSymbol,
  { label: string; icon: string; color: string }
> = {
  cherry: { label: "Cherry", icon: "🍒", color: "#f43f5e" },
  lemon: { label: "Lemon", icon: "🍋", color: "#eab308" },
  bell: { label: "Bell", icon: "🔔", color: "#f59e0b" },
  bar: { label: "BAR", icon: "🎰", color: "#3b82f6" },
  seven: { label: "Seven", icon: "7️⃣", color: "#ef4444" },
};

const STRIP_SYMBOLS: SlotSymbol[] = [
  "seven",
  "cherry",
  "bell",
  "lemon",
  "bar",
  "cherry",
  "seven",
  "lemon",
  "bell",
  "bar",
];

export interface SlotMachineProps {
  apiClient?: ApiClient | undefined;
  isDevelopmentMode?: boolean | undefined;
  spinHook?: UseSpinResult | undefined;
}

export const SlotMachine: React.FC<SlotMachineProps> = ({
  apiClient,
  isDevelopmentMode = false,
  spinHook,
}) => {
  const defaultHook = useSpin({ apiClient });
  const hook = spinHook ?? defaultHook;

  const {
    state,
    balance,
    stake,
    gameVersion,
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
    toggleReducedMotion,
  } = hook;

  const [history, setHistory] = useState<SpinRepresentation[]>([]);

  // Keep local history updated when lastRound changes
  useEffect(() => {
    if (lastRound) {
      setHistory((prev) => {
        if (prev.some((r) => r.roundId === lastRound.roundId)) {
          return prev;
        }
        return [lastRound, ...prev].slice(0, 10);
      });
    }
  }, [lastRound]);

  const isSpinning = state === "requesting" || state === "animating";
  const isWin = state === "settled" && payout > 0;

  return (
    <main className="slot-container" role="main" aria-label="Slot Machine Game">
      {/* Top Machine Frame */}
      <header className="slot-header">
        <div className="neon-top-sign">
          <span className="neon-star">★</span>
          <h1 className="slot-title">Classic Slots</h1>
          <span className="neon-star">★</span>
        </div>

        {isDevelopmentMode && (
          <div
            className="dev-badge"
            data-testid="dev-badge"
            aria-label="Environment Mode"
          >
            Development Mode
          </div>
        )}

        <div
          className="disclaimer-banner"
          data-testid="no-cash-value-disclaimer"
          role="note"
          aria-label="Legal Disclaimer"
        >
          Virtual Credits Only • No Real Cash Value • Entertainment Only
        </div>
      </header>

      {/* Main Physical Cabinet */}
      <div className={`slot-cabinet-chassis ${isWin ? "chassis-winner" : ""}`}>
        {/* Lights Crown */}
        <div className="cabinet-crown">
          <div className="marquee-lights">
            <span className="light-dot dot-1"></span>
            <span className="light-dot dot-2"></span>
            <span className="light-dot dot-3"></span>
            <span className="light-dot dot-4"></span>
            <span className="light-dot dot-5"></span>
            <span className="light-dot dot-6"></span>
            <span className="light-dot dot-7"></span>
            <span className="light-dot dot-8"></span>
          </div>
        </div>

        {/* Digital Meters */}
        <section className="stats-panel" aria-label="Wallet and Game Info">
          <div className="stat-item">
            <span className="stat-label">Virtual Balance</span>
            <span
              className="stat-value highlight digital-meter"
              data-testid="balance-display"
              aria-live="polite"
            >
              {state === "booting" ? "..." : `${balance} Credits`}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Stake per Spin</span>
            <span
              className="stat-value digital-meter"
              data-testid="stake-display"
            >
              {stake} Credits
            </span>
          </div>
        </section>

        {/* Main Reels Window */}
        <section className="slot-cabinet" aria-label="Slot Cabinet">
          <div
            className="reels-wrapper"
            role="region"
            aria-label="Slot reels"
            data-testid="reels-wrapper"
          >
            {/* Central Winning Payline */}
            <div
              className={`payline-indicator ${isWin ? "payline-active" : ""}`}
              data-testid="central-payline"
              aria-hidden="true"
            >
              <div className="payline-laser"></div>
              <span className="payline-tag">WIN LINE</span>
            </div>

            {/* Three Reels */}
            <div className="reels-container">
              {symbols.map((symbol, idx) => {
                const symConfig = SYMBOL_CONFIG[symbol] ?? {
                  label: symbol,
                  icon: "❓",
                  color: "#fff",
                };
                return (
                  <div
                    key={idx}
                    className={`slot-reel ${isSpinning && !isReducedMotion ? `animating reel-delay-${idx}` : ""} ${isWin ? "reel-win-glow" : ""}`}
                    data-testid={`reel-${idx}`}
                    role="group"
                    aria-label={`Reel ${idx + 1}: ${symConfig.label}`}
                  >
                    <div className="reel-glass-reflection"></div>
                    <div className="reel-strip-cylinder">
                      {isSpinning && !isReducedMotion ? (
                        <div className="blur-strip">
                          {STRIP_SYMBOLS.map((s, sIdx) => (
                            <div key={sIdx} className="blur-symbol">
                              {SYMBOL_CONFIG[s]?.icon ?? s}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="reel-symbol-display">
                          <span
                            className="symbol-icon"
                            aria-hidden="true"
                            style={{
                              filter: `drop-shadow(0 0 10px ${symConfig.color}88)`,
                            }}
                          >
                            {symConfig.icon}
                          </span>
                          <span className="symbol-name">{symConfig.label}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outcome & Jackpot Announcements */}
          <div
            className="announcement-area"
            aria-live="polite"
            aria-atomic="true"
            data-testid="announcement-area"
          >
            {state === "settled" && lastRound && (
              <div
                className={`outcome-banner ${payout > 0 ? "win" : "no-win"}`}
                data-testid="outcome-banner"
              >
                {payout > 0 ? (
                  <div className="win-content">
                    <span className="win-title">
                      ✨ WIN! +{payout} Virtual Credits!
                    </span>
                    <span className="win-amount">
                      (Multiplier: {payout / stake}x)
                    </span>
                  </div>
                ) : (
                  <span>No win this spin. Try again!</span>
                )}
              </div>
            )}

            {state === "error" && error && (
              <div
                className="outcome-banner error"
                data-testid="error-banner"
                role="alert"
              >
                ⚠️ {error.message || "An error occurred"}
              </div>
            )}
          </div>

          {/* Machine Controls & Lever */}
          <div className="controls-panel">
            <button
              type="button"
              className={`spin-btn ${isSpinning ? "btn-spinning" : ""}`}
              data-testid="spin-button"
              onClick={() => void spin()}
              disabled={!canSpin}
              aria-busy={isSpinning}
              aria-label={
                isSpinning
                  ? "Spinning reels..."
                  : state === "booting"
                    ? "Loading wallet..."
                    : `Spin reels for ${stake} credits`
              }
            >
              <span className="spin-btn-shine"></span>
              <span className="spin-btn-text">
                {isSpinning
                  ? "SPINNING..."
                  : state === "booting"
                    ? "LOADING..."
                    : "SPIN"}
              </span>
            </button>

            {state === "error" && pendingKey && (
              <button
                type="button"
                className="retry-btn"
                data-testid="retry-button"
                onClick={() => void retry()}
                aria-label="Retry failed spin with same key"
              >
                Retry Last Spin (Recover)
              </button>
            )}

            <button
              type="button"
              className="refresh-btn"
              data-testid="refresh-button"
              onClick={() => void refresh()}
              aria-label="Refresh player balance"
            >
              Refresh Balance
            </button>
          </div>
        </section>
      </div>

      {/* Paytable & Preferences Drawer */}
      <section className="paytable-section" aria-label="Game Payout Rules">
        <h2 className="section-title">🏆 Payout Table (3 Matching)</h2>
        <div className="paytable-grid">
          <div className="paytable-item">
            <span className="paytable-icons">7️⃣ 7️⃣ 7️⃣</span>
            <span className="paytable-val gold">100x (1,000 CR)</span>
          </div>
          <div className="paytable-item">
            <span className="paytable-icons">🎰 🎰 🎰</span>
            <span className="paytable-val blue">50x (500 CR)</span>
          </div>
          <div className="paytable-item">
            <span className="paytable-icons">🔔 🔔 🔔</span>
            <span className="paytable-val amber">20x (200 CR)</span>
          </div>
          <div className="paytable-item">
            <span className="paytable-icons">🍋 🍋 🍋</span>
            <span className="paytable-val yellow">10x (100 CR)</span>
          </div>
          <div className="paytable-item">
            <span className="paytable-icons">🍒 🍒 🍒</span>
            <span className="paytable-val red">5x (50 CR)</span>
          </div>
        </div>
      </section>

      {/* History */}
      <section className="history-section" aria-label="Spin History">
        <h2 className="section-title">📜 Recent Spins</h2>
        {history.length === 0 ? (
          <p className="no-history">No spins in this session yet.</p>
        ) : (
          <ul className="history-list" data-testid="history-list">
            {history.map((round) => (
              <li
                key={round.roundId}
                className={`history-item ${round.payout > 0 ? "win" : "loss"}`}
                data-testid="history-item"
              >
                <div className="history-symbols">
                  {round.symbols.map((sym, sIdx) => (
                    <span key={sIdx} className="history-sym">
                      {SYMBOL_CONFIG[sym]?.icon ?? sym}
                    </span>
                  ))}
                </div>
                <div className="history-details">
                  <span className="history-payout">
                    {round.payout > 0
                      ? `+${round.payout} CR`
                      : `-${round.stake} CR`}
                  </span>
                  <span className="history-balance">
                    Bal: {round.balanceAfter} CR
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settings Footer */}
      <footer className="slot-footer">
        <label className="reduced-motion-toggle">
          <input
            type="checkbox"
            checked={isReducedMotion}
            onChange={toggleReducedMotion}
            data-testid="reduced-motion-toggle"
            aria-label="Toggle Reduced Motion"
          />
          <span>Reduced Motion (Instant Spin)</span>
        </label>
        <div className="game-version">Engine: {gameVersion}</div>
      </footer>
    </main>
  );
};

export default SlotMachine;

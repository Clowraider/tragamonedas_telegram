import { describe, expect, it } from "vitest";

import {
  AdminAdjustBalanceRequestSchema,
  AdminMetricsSchema,
  AdminPlayerSchema,
  AdminSpinFeedItemSchema,
  ApiErrorSchema,
  DEFAULT_HISTORY_LIMIT,
  HistoryQuerySchema,
  IdempotencyKeySchema,
  MAX_HISTORY_LIMIT,
  PlayerSnapshotSchema,
  SlotSymbolsSchema,
  SpinHistorySchema,
  SpinRepresentationSchema,
  SpinRequestSchema,
  type SpinRepresentation,
} from "../src/index.js";

const round: SpinRepresentation = {
  roundId: "5a9f3848-154f-4e8c-8eb4-e3c9ea3b5595",
  status: "settled",
  symbols: ["cherry", "cherry", "cherry"],
  stake: 10,
  payout: 50,
  balanceBefore: 100,
  balanceAfter: 140,
  gameVersion: "classic-1",
  createdAt: "2026-07-30T18:00:00.000Z",
};

describe("spin contracts", () => {
  it("accepts a fixed-term spin request", () => {
    expect(
      SpinRequestSchema.parse({ stake: 10, gameVersion: "classic-1" }),
    ).toEqual({ stake: 10, gameVersion: "classic-1" });
  });

  it("rejects non-integer credits and client-proposed fields", () => {
    expect(
      SpinRequestSchema.safeParse({ stake: 1.5, gameVersion: "classic-1" })
        .success,
    ).toBe(false);
    expect(
      SpinRequestSchema.safeParse({
        stake: 10,
        gameVersion: "classic-1",
        symbols: ["seven", "seven", "seven"],
      }).success,
    ).toBe(false);
  });

  it("requires exactly three known symbols", () => {
    expect(SlotSymbolsSchema.parse(round.symbols)).toEqual(round.symbols);
    expect(SlotSymbolsSchema.safeParse(["cherry", "lemon"]).success).toBe(
      false,
    );
    expect(
      SlotSymbolsSchema.safeParse(["cherry", "lemon", "unknown"]).success,
    ).toBe(false);
  });

  it("validates the settled round representation", () => {
    expect(SpinRepresentationSchema.parse(round)).toEqual(round);
    expect(
      SpinRepresentationSchema.safeParse({ ...round, balanceAfter: -1 })
        .success,
    ).toBe(false);
  });
});

describe("identity and error contracts", () => {
  it("requires UUID idempotency keys", () => {
    expect(
      IdempotencyKeySchema.parse("ac67b2a4-987b-4579-86aa-c8f776aca993"),
    ).toBe("ac67b2a4-987b-4579-86aa-c8f776aca993");
    expect(IdempotencyKeySchema.safeParse("spin-1").success).toBe(false);
  });

  it("validates player snapshots and stable API errors", () => {
    expect(
      PlayerSnapshotSchema.safeParse({
        playerId: "efbf5a6a-a6ab-41fe-acbc-94c9751e186e",
        balance: 100,
        stake: 10,
        gameVersion: "classic-1",
        recentRound: round,
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        code: "IDEMPOTENCY_CONFLICT",
        message: "The idempotency key was used for different terms.",
        requestId: "request-1",
      }).success,
    ).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        code: "UNKNOWN_ERROR",
        message: "Unknown",
        requestId: "request-1",
      }).success,
    ).toBe(false);
  });
});

describe("bounded history contracts", () => {
  it("defaults and caps the requested page size", () => {
    expect(HistoryQuerySchema.parse({}).limit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(HistoryQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(
      HistoryQuerySchema.safeParse({ limit: MAX_HISTORY_LIMIT + 1 }).success,
    ).toBe(false);
  });

  it("rejects responses larger than the maximum page size", () => {
    expect(
      SpinHistorySchema.safeParse({ items: [round], nextCursor: null }).success,
    ).toBe(true);
    expect(
      SpinHistorySchema.safeParse({
        items: Array.from({ length: MAX_HISTORY_LIMIT + 1 }, () => round),
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});

describe("admin contracts", () => {
  it("validates admin metrics schema", () => {
    const validMetrics = {
      totalPlayers: 15,
      circulatingCredits: 15000,
      totalSpins: 120,
      totalWagered: 1200,
      totalPaidOut: 1134,
      grossGamingRevenue: 66,
      winningSpinsCount: 30,
      globalWinRatePercent: 25.0,
      jackpotSpinsCount: 2,
      jackpotPaidOut: 500,
      observedRtpPercent: 94.5,
    };
    expect(AdminMetricsSchema.safeParse(validMetrics).success).toBe(true);
    expect(
      AdminMetricsSchema.safeParse({ ...validMetrics, totalPlayers: -1 })
        .success,
    ).toBe(false);
  });

  it("validates admin player schema", () => {
    const validPlayer = {
      id: "5a9f3848-154f-4e8c-8eb4-e3c9ea3b5595",
      authProvider: "telegram",
      providerSubject: "123456",
      username: "testuser",
      firstName: "Test",
      balance: 1000,
      createdAt: "2026-07-30T18:00:00.000Z",
      updatedAt: "2026-07-30T18:00:00.000Z",
      stats: {
        totalSpins: 50,
        totalWagered: 500,
        totalWon: 450,
        netProfit: -50,
        winRatePercent: 24.0,
        biggestWinAmount: 200,
        biggestWinMultiplier: 20.0,
        maxWinningStreak: 3,
        currentStreakCount: -2,
        favoriteStake: 10,
        lastSpinAt: "2026-07-30T18:30:00.000Z",
      },
    };
    expect(AdminPlayerSchema.safeParse(validPlayer).success).toBe(true);
  });

  it("validates admin balance adjustment schema and rejects empty reason", () => {
    expect(
      AdminAdjustBalanceRequestSchema.safeParse({
        action: "grant",
        amount: 500,
        reason: "VIP bonus compensation",
      }).success,
    ).toBe(true);

    expect(
      AdminAdjustBalanceRequestSchema.safeParse({
        action: "grant",
        amount: 500,
        reason: "   ",
      }).success,
    ).toBe(false);

    expect(
      AdminAdjustBalanceRequestSchema.safeParse({
        action: "invalid_action",
        amount: 500,
        reason: "Valid reason",
      }).success,
    ).toBe(false);
  });

  it("validates admin spin feed item schema", () => {
    const feedItem = {
      roundId: "5a9f3848-154f-4e8c-8eb4-e3c9ea3b5595",
      playerId: "5a9f3848-154f-4e8c-8eb4-e3c9ea3b5595",
      username: "player1",
      firstName: "Player",
      stake: 10,
      payout: 50,
      symbols: ["cherry", "cherry", "cherry"] as const,
      balanceBefore: 100,
      balanceAfter: 140,
      createdAt: "2026-07-30T18:00:00.000Z",
    };
    expect(AdminSpinFeedItemSchema.safeParse(feedItem).success).toBe(true);
  });
});

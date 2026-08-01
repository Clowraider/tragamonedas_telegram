import { z } from "zod";

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 50;

const PositiveCreditAmountSchema = z.number().int().positive();
const CreditBalanceSchema = z.number().int().nonnegative();

export const IdempotencyKeySchema = z.string().uuid();
export const GameVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i);

export const SlotSymbolSchema = z.enum([
  "cherry",
  "lemon",
  "bell",
  "bar",
  "seven",
]);

export const SlotSymbolsSchema = z.tuple([
  SlotSymbolSchema,
  SlotSymbolSchema,
  SlotSymbolSchema,
]);

export const SpinRequestSchema = z
  .object({
    stake: PositiveCreditAmountSchema,
    gameVersion: GameVersionSchema,
  })
  .strict();

export const SpinRepresentationSchema = z
  .object({
    roundId: z.string().uuid(),
    status: z.literal("settled"),
    symbols: SlotSymbolsSchema,
    stake: PositiveCreditAmountSchema,
    payout: CreditBalanceSchema,
    balanceBefore: CreditBalanceSchema,
    balanceAfter: CreditBalanceSchema,
    gameVersion: GameVersionSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const HistoryQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_HISTORY_LIMIT)
      .default(DEFAULT_HISTORY_LIMIT),
    cursor: z.string().uuid().optional(),
  })
  .strict();

export const SpinHistorySchema = z
  .object({
    items: z.array(SpinRepresentationSchema).max(MAX_HISTORY_LIMIT),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();

export const PlayerSnapshotSchema = z
  .object({
    playerId: z.string().uuid(),
    balance: CreditBalanceSchema,
    stake: PositiveCreditAmountSchema,
    gameVersion: GameVersionSchema,
    recentRound: SpinRepresentationSchema.nullable(),
  })
  .strict();

export const ErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "INSUFFICIENT_CREDITS",
  "GAME_VERSION_MISMATCH",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().trim().min(1).max(256),
    requestId: z.string().trim().min(1).max(128),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type SlotSymbol = z.infer<typeof SlotSymbolSchema>;
export type SpinHistory = z.infer<typeof SpinHistorySchema>;
export type SpinRepresentation = z.infer<typeof SpinRepresentationSchema>;
export type SpinRequest = z.infer<typeof SpinRequestSchema>;

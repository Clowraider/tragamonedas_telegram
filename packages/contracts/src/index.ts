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

// Admin Contracts
export const AdminMetricsSchema = z
  .object({
    totalPlayers: z.number().int().nonnegative(),
    circulatingCredits: z.number().int().nonnegative(),
    totalSpins: z.number().int().nonnegative(),
    observedRtpPercent: z.number().nonnegative(),
  })
  .strict();

export const AdminPlayerSchema = z
  .object({
    id: z.string().uuid(),
    authProvider: z.string(),
    providerSubject: z.string(),
    username: z.string().nullable(),
    firstName: z.string().nullable(),
    balance: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const AdminPlayerListQuerySchema = z
  .object({
    search: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const AdminPlayerListResponseSchema = z
  .object({
    players: z.array(AdminPlayerSchema),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const AdminAdjustBalanceActionSchema = z.enum([
  "grant",
  "deduct",
  "set",
]);

export const AdminAdjustBalanceRequestSchema = z
  .object({
    action: AdminAdjustBalanceActionSchema,
    amount: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const AdminAdjustBalanceResponseSchema = z
  .object({
    playerId: z.string().uuid(),
    balanceBefore: z.number().int().nonnegative(),
    balanceAfter: z.number().int().nonnegative(),
    auditLogId: z.string().uuid(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const AdminSpinFeedItemSchema = z
  .object({
    roundId: z.string().uuid(),
    playerId: z.string().uuid(),
    username: z.string().nullable(),
    firstName: z.string().nullable().optional(),
    stake: PositiveCreditAmountSchema,
    payout: CreditBalanceSchema,
    symbols: SlotSymbolsSchema,
    balanceBefore: CreditBalanceSchema,
    balanceAfter: CreditBalanceSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const AdminSpinFeedResponseSchema = z
  .object({
    items: z.array(AdminSpinFeedItemSchema),
  })
  .strict();

export const AdminAuditLogSchema = z
  .object({
    id: z.string().uuid(),
    playerId: z.string().uuid(),
    username: z.string().nullable().optional(),
    actionType: AdminAdjustBalanceActionSchema,
    amount: z.number().int().nonnegative(),
    balanceBefore: z.number().int().nonnegative(),
    balanceAfter: z.number().int().nonnegative(),
    reason: z.string().trim().min(1),
    adminIdentifier: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const AdminAuditLogListResponseSchema = z
  .object({
    items: z.array(AdminAuditLogSchema),
  })
  .strict();

export type AdminMetrics = z.infer<typeof AdminMetricsSchema>;
export type AdminPlayer = z.infer<typeof AdminPlayerSchema>;
export type AdminPlayerListQuery = z.infer<typeof AdminPlayerListQuerySchema>;
export type AdminPlayerListResponse = z.infer<
  typeof AdminPlayerListResponseSchema
>;
export type AdminAdjustBalanceAction = z.infer<
  typeof AdminAdjustBalanceActionSchema
>;
export type AdminAdjustBalanceRequest = z.infer<
  typeof AdminAdjustBalanceRequestSchema
>;
export type AdminAdjustBalanceResponse = z.infer<
  typeof AdminAdjustBalanceResponseSchema
>;
export type AdminSpinFeedItem = z.infer<typeof AdminSpinFeedItemSchema>;
export type AdminSpinFeedResponse = z.infer<typeof AdminSpinFeedResponseSchema>;
export type AdminAuditLog = z.infer<typeof AdminAuditLogSchema>;
export type AdminAuditLogListResponse = z.infer<
  typeof AdminAuditLogListResponseSchema
>;

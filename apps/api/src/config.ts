import { config } from "dotenv";
import { z } from "zod";

config({ path: "../../.env" });

const AuthModeSchema = z.enum(["telegram", "development"]);

export const AppConfigSchema = z
  .object({
    nodeEnv: z
      .enum(["development", "production", "test"])
      .default("development"),
    port: z.coerce.number().int().positive().default(3000),
    logLevel: z.string().default("info"),
    databaseUrl: z.string().min(1),
    authMode: AuthModeSchema.default("development"),
    telegramBotToken: z.string().optional(),
    appSecret: z.string().min(1),
    startingBalance: z.coerce.number().int().positive().default(1000),
    stake: z.coerce.number().int().positive().default(10),
    gameVersion: z.string().min(1).default("classic-1"),
    authDateMaxAgeSeconds: z.coerce.number().int().nonnegative().default(86400),
  })
  .strict()
  .refine(
    (data) =>
      !(data.nodeEnv === "production" && data.authMode === "development"),
    {
      message: "AUTH_MODE=development is not allowed in production",
      path: ["authMode"],
    },
  )
  .refine(
    (data) =>
      data.authMode !== "telegram" ||
      (data.telegramBotToken !== undefined && data.telegramBotToken.length > 0),
    {
      message: "TELEGRAM_BOT_TOKEN is required when AUTH_MODE=telegram",
      path: ["telegramBotToken"],
    },
  );

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  return AppConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    authMode: env.AUTH_MODE,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    appSecret: env.APP_SECRET,
    startingBalance: env.DEFAULT_BALANCE,
    stake: env.DEFAULT_STAKE,
    gameVersion: env.GAME_VERSION,
    authDateMaxAgeSeconds: env.AUTH_DATE_MAX_AGE_SECONDS,
  });
}

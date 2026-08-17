import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env looking in common locations (current working directory, monorepo root, or apps/api parent)
const candidatePaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../.env"),
];
for (const envPath of candidatePaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

const AuthModeSchema = z.enum(["telegram", "development"]);

export const AppConfigSchema = z
  .object({
    nodeEnv: z
      .enum(["development", "production", "test"])
      .default("development"),
    port: z.coerce.number().int().positive().default(3000),
    adminPort: z.coerce.number().int().positive().default(3001),
    adminApiKey: z
      .string()
      .min(8)
      .default("admin-secret-key-for-local-dev-and-testing"),
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

export function resolveDatabaseUrl(
  env: Record<string, string | undefined>,
): string | undefined {
  if (env.DATABASE_URL && env.DATABASE_URL.trim().length > 0) {
    return env.DATABASE_URL.trim();
  }

  const user = env.DB_USER ?? env.POSTGRES_USER;
  const password = env.DB_PASSWORD ?? env.POSTGRES_PASSWORD;
  const host = env.DB_HOST ?? env.POSTGRES_HOST ?? "localhost";
  const port = env.DB_PORT ?? env.POSTGRES_PORT ?? "5432";
  const db = env.DB_NAME ?? env.POSTGRES_DB;

  if (user && db) {
    const authPart =
      password !== undefined && password.length > 0
        ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
        : `${encodeURIComponent(user)}@`;
    return `postgresql://${authPart}${host}:${port}/${db}`;
  }

  return undefined;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  return AppConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    adminPort: env.ADMIN_PORT,
    adminApiKey: env.ADMIN_API_KEY,
    logLevel: env.LOG_LEVEL,
    databaseUrl: resolveDatabaseUrl(env),
    authMode: env.AUTH_MODE,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    appSecret: env.APP_SECRET,
    startingBalance: env.DEFAULT_BALANCE,
    stake: env.DEFAULT_STAKE,
    gameVersion: env.GAME_VERSION,
    authDateMaxAgeSeconds: env.AUTH_DATE_MAX_AGE_SECONDS,
  });
}

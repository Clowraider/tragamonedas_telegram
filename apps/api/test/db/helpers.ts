import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { runMigrations } from "../../src/db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../../../../.env") });

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://slot:slot@localhost:5432/slot_machine"
  );
}

export async function withTestSchema<T>(
  fn: (pool: pg.Pool) => Promise<T>,
): Promise<T> {
  const schema = `test_${randomUUID().replace(/-/g, "_")}`;
  const baseUrl = getDatabaseUrl();

  const adminClient = new pg.Client(baseUrl);
  await adminClient.connect();
  await adminClient.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await adminClient.query(`SET search_path TO ${schema}`);
  await runMigrations(adminClient);
  await adminClient.end();

  const pool = new pg.Pool({
    connectionString: baseUrl,
    max: 1,
  });

  let searchPathReady: Promise<void> | undefined;
  pool.on("connect", (client) => {
    searchPathReady = client
      .query(`SET search_path TO ${schema}`)
      .then(() => {});
  });

  const primeClient = await pool.connect();
  if (searchPathReady) {
    await searchPathReady;
  }
  primeClient.release();

  try {
    return await fn(pool);
  } finally {
    await pool.end();
    const cleanupClient = new pg.Client(baseUrl);
    await cleanupClient.connect();
    await cleanupClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await cleanupClient.end();
  }
}

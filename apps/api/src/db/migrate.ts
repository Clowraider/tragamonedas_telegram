import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
  client: pg.Client | pg.PoolClient,
): Promise<void> {
  const sql = await readFile(
    join(__dirname, "../../migrations/001_initial.sql"),
    "utf8",
  );
  await client.query(sql);
}

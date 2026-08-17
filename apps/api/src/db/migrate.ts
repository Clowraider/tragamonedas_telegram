import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
  client: pg.Client | pg.PoolClient,
): Promise<void> {
  const migrationsDir = join(__dirname, "../../migrations");
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter((file) => file.endsWith(".sql")).sort();

  for (const file of sqlFiles) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query(sql);
  }
}

import pg from "pg";

import { loadConfig } from "../config.js";
import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
  });

  try {
    const client = await pool.connect();
    try {
      console.log("Applying database migrations...");
      await runMigrations(client);
      console.log("Database migrations applied successfully.");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

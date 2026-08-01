import pg from "pg";

import { loadConfig } from "../config.js";

export type DbPool = pg.Pool;

export function createPool(): DbPool {
  const config = loadConfig();
  return new pg.Pool({
    connectionString: config.databaseUrl,
  });
}

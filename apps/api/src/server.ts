import pg from "pg";
import { buildAdminApp } from "./admin/app.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
  });

  const playerApp = await buildApp({ config, pool });
  const adminApp = await buildAdminApp({ config, pool });

  const playerAddress = await playerApp.listen({
    port: config.port,
    host: "0.0.0.0",
  });
  playerApp.log.info(`Player application listening on ${playerAddress}`);

  const adminAddress = await adminApp.listen({
    port: config.adminPort,
    host: "0.0.0.0",
  });
  adminApp.log.info(`Admin console & operations listening on ${adminAddress}`);

  const shutdown = async () => {
    playerApp.log.info("Shutting down servers...");
    await Promise.all([playerApp.close(), adminApp.close()]);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

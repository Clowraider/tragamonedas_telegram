import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp();
  const address = await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: "0.0.0.0",
  });
  app.log.info(`Server listening on ${address}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

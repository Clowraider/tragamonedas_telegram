import type { FastifyInstance } from "fastify";
import pg from "pg";

export async function healthRoute(app: FastifyInstance): Promise<void> {
  const pool: pg.Pool = (app as unknown as { pool: pg.Pool }).pool;

  app.get("/healthz", async (_request, reply) => {
    reply.code(200).send({ status: "ok" });
  });

  app.get("/readyz", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      reply.code(200).send({ status: "ok" });
    } catch {
      reply.code(503).send({ status: "unavailable" });
    }
  });
}

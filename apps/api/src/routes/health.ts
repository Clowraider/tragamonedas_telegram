import type { FastifyInstance } from "fastify";
import pg from "pg";

export async function healthRoute(app: FastifyInstance): Promise<void> {
  const pool: pg.Pool = (app as unknown as { pool: pg.Pool }).pool;

  const liveHandler = async (
    _request: unknown,
    reply: { code: (c: number) => { send: (o: object) => void } },
  ) => {
    reply.code(200).send({ status: "ok" });
  };

  const readyHandler = async (
    _request: unknown,
    reply: { code: (c: number) => { send: (o: object) => void } },
  ) => {
    try {
      await pool.query("SELECT 1");
      reply.code(200).send({ status: "ok" });
    } catch {
      reply.code(503).send({ status: "unavailable" });
    }
  };

  app.get("/healthz", liveHandler);
  app.get("/health/live", liveHandler);

  app.get("/readyz", readyHandler);
  app.get("/health/ready", readyHandler);
}

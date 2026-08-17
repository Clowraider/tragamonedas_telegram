import type { FastifyPluginAsync } from "fastify";
import { AdminService } from "../service.js";

export const adminMetricsRoute: FastifyPluginAsync = async (app) => {
  const service = new AdminService(app.pool);

  app.get("/metrics", async (_req, reply) => {
    const metrics = await service.getMetrics();
    return reply.code(200).send(metrics);
  });
};

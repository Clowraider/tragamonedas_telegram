import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AdminService } from "../service.js";

const AuditLogsQuerySchema = z.object({
  playerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminAuditLogsRoute: FastifyPluginAsync = async (app) => {
  const service = new AdminService(app.pool);

  app.get("/audit-logs", async (req, reply) => {
    const queryParse = AuditLogsQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: "Invalid query parameters: " + queryParse.error.message,
        requestId: req.id,
      });
    }

    const { playerId, limit } = queryParse.data;
    const items = await service.listAuditLogs({ playerId, limit });
    return reply.code(200).send({ items });
  });
};

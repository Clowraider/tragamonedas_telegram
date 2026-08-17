import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AdminService } from "../service.js";

const SpinsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminSpinsRoute: FastifyPluginAsync = async (app) => {
  const service = new AdminService(app.pool);

  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const queryParse = SpinsQuerySchema.safeParse(req.query);
    const limit = queryParse.success ? queryParse.data.limit : 50;
    const items = await service.listRecentSpins(limit);
    return reply.code(200).send({ items });
  };

  app.get("/spins/recent", handler);
  app.get("/spins", handler);
};

import {
  AdminAdjustBalanceRequestSchema,
  AdminPlayerListQuerySchema,
} from "@slot-machine/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AdminService, AdminServiceError } from "../service.js";

const PlayerParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminPlayersRoute: FastifyPluginAsync = async (app) => {
  const service = new AdminService(app.pool);

  app.get("/players", async (req, reply) => {
    const queryParse = AdminPlayerListQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: "Invalid query parameters: " + queryParse.error.message,
        requestId: req.id,
      });
    }

    const { search, limit, offset } = queryParse.data;
    const result = await service.listPlayers({ search, limit, offset });
    return reply.code(200).send(result);
  });

  app.post<{ Params: { id: string } }>(
    "/players/:id/adjust",
    async (req, reply) => {
      const paramsParse = PlayerParamsSchema.safeParse(req.params);
      if (!paramsParse.success) {
        return reply.code(400).send({
          code: "BAD_REQUEST",
          message: "Invalid player ID format (UUID expected)",
          requestId: req.id,
        });
      }

      const bodyParse = AdminAdjustBalanceRequestSchema.safeParse(req.body);
      if (!bodyParse.success) {
        return reply.code(400).send({
          code: "BAD_REQUEST",
          message:
            "Invalid adjustment payload: " + bodyParse.error.issues[0]?.message,
          requestId: req.id,
        });
      }

      try {
        const adjustment = await service.adjustBalance(
          paramsParse.data.id,
          bodyParse.data,
          "admin-console",
        );
        return reply.code(200).send(adjustment);
      } catch (err) {
        if (err instanceof AdminServiceError) {
          const statusCode =
            err.code === "NOT_FOUND"
              ? 404
              : err.code === "INSUFFICIENT_CREDITS" ||
                  err.code === "BAD_REQUEST"
                ? 400
                : 500;
          return reply.code(statusCode).send({
            code: err.code,
            message: err.message,
            requestId: req.id,
          });
        }
        throw err;
      }
    },
  );
};

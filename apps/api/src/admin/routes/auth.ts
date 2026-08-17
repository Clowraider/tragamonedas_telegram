import type { FastifyPluginAsync } from "fastify";
import { verifyAdminApiKey } from "../auth.js";

export const adminAuthRoute: FastifyPluginAsync = async (app) => {
  const configApiKey = app.config.adminApiKey;

  app.get("/auth/verify", async (_req, reply) => {
    return reply.code(200).send({ status: "authenticated" });
  });

  app.post<{ Body: { apiKey?: string } }>("/auth/login", async (req, reply) => {
    const { apiKey } = req.body ?? {};
    if (!verifyAdminApiKey(apiKey, configApiKey)) {
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Invalid admin API key",
        requestId: req.id,
      });
    }

    reply.header(
      "Set-Cookie",
      `admin_token=${encodeURIComponent(apiKey!)}; Path=/; HttpOnly; SameSite=Lax`,
    );
    return reply.code(200).send({ status: "authenticated" });
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.header(
      "Set-Cookie",
      "admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    return reply.code(200).send({ status: "logged_out" });
  });
};

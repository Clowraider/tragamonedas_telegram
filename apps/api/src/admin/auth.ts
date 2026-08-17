import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Constant-time string comparison using SHA-256 digest to normalize length
 * and prevent timing attacks.
 */
export function verifyAdminApiKey(
  providedKey: string | undefined | null,
  configuredKey: string,
): boolean {
  if (typeof providedKey !== "string" || providedKey.length === 0) {
    return false;
  }
  const providedHash = createHash("sha256").update(providedKey).digest();
  const configuredHash = createHash("sha256").update(configuredKey).digest();
  return timingSafeEqual(providedHash, configuredHash);
}

export function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}

export function createAdminAuthHook(configuredApiKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const headerKey = request.headers["x-admin-api-key"];
    const cookieToken = parseCookie(request.headers.cookie, "admin_token");

    const providedKey =
      typeof headerKey === "string" && headerKey.length > 0
        ? headerKey
        : cookieToken;

    if (!verifyAdminApiKey(providedKey, configuredApiKey)) {
      reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Invalid or missing admin API key",
        requestId: request.id,
      });
    }
  };
}

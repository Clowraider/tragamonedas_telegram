import {
  ApiErrorSchema,
  type ErrorCode,
  type PlayerSnapshot,
  PlayerSnapshotSchema,
  type SpinHistory,
  SpinHistorySchema,
  type SpinRepresentation,
  SpinRepresentationSchema,
  type SpinRequest,
} from "@slot-machine/contracts";

import { getTelegramInitData } from "./telegram.js";
import { generateUUID } from "./uuid.js";

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly requestId: string;
  readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    requestId: string,
    status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

export interface ApiClientConfig {
  baseUrl?: string | undefined;
  getInitData?: (() => string | null) | undefined;
  fetchFn?: typeof fetch | undefined;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getInitData: () => string | null;
  private readonly fetch: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl?.replace(/\/$/, "") ?? "";
    this.getInitData = config.getInitData ?? getTelegramInitData;
    this.fetch = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private createHeaders(
    extraHeaders: Record<string, string> = {},
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "x-request-id": generateUUID(),
      ...extraHeaders,
    };

    const initData = this.getInitData();
    if (initData && initData.trim().length > 0) {
      headers["x-telegram-init-data"] = initData;
    }

    return headers;
  }

  private async handleResponse<T>(
    response: Response,
    schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    const requestId =
      response.headers.get("x-request-id") ?? generateUUID();

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (!response.ok) {
        throw new ApiClientError(
          "INTERNAL_ERROR",
          `HTTP Error ${response.status}: ${response.statusText}`,
          requestId,
          response.status,
        );
      }
      throw new ApiClientError(
        "INTERNAL_ERROR",
        "Failed to parse JSON response",
        requestId,
        response.status,
      );
    }

    if (!response.ok) {
      const parsedError = ApiErrorSchema.safeParse(json);
      if (parsedError.success) {
        throw new ApiClientError(
          parsedError.data.code,
          parsedError.data.message,
          parsedError.data.requestId,
          response.status,
        );
      }

      throw new ApiClientError(
        "INTERNAL_ERROR",
        typeof json === "object" && json !== null && "message" in json
          ? String((json as Record<string, unknown>).message)
          : `Request failed with status ${response.status}`,
        requestId,
        response.status,
      );
    }

    return schema.parse(json);
  }

  /**
   * Fetch current authenticated player snapshot (balance, stake, game version, recent round).
   */
  async getMe(): Promise<PlayerSnapshot> {
    const response = await this.fetch(`${this.baseUrl}/v1/me`, {
      method: "GET",
      headers: this.createHeaders(),
    });

    return this.handleResponse(response, PlayerSnapshotSchema);
  }

  /**
   * Execute an authoritative spin round with an idempotency key.
   */
  async spin(params: {
    idempotencyKey: string;
    stake: number;
    gameVersion: string;
  }): Promise<SpinRepresentation> {
    const body: SpinRequest = {
      stake: params.stake,
      gameVersion: params.gameVersion,
    };

    const response = await this.fetch(`${this.baseUrl}/v1/spins`, {
      method: "POST",
      headers: this.createHeaders({
        "Content-Type": "application/json",
        "idempotency-key": params.idempotencyKey,
      }),
      body: JSON.stringify(body),
    });

    return this.handleResponse(response, SpinRepresentationSchema);
  }

  /**
   * Recover a previously played spin round by ID.
   */
  async getRound(roundId: string): Promise<SpinRepresentation> {
    const response = await this.fetch(
      `${this.baseUrl}/v1/spins/${encodeURIComponent(roundId)}`,
      {
        method: "GET",
        headers: this.createHeaders(),
      },
    );

    return this.handleResponse(response, SpinRepresentationSchema);
  }

  /**
   * List recent spins for the authenticated player (bounded newest-first).
   */
  async getHistory(
    params: { limit?: number; cursor?: string } = {},
  ): Promise<SpinHistory> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) {
      query.set("limit", String(params.limit));
    }
    if (params.cursor !== undefined) {
      query.set("cursor", params.cursor);
    }

    const qs = query.toString();
    const url = `${this.baseUrl}/v1/spins${qs ? `?${qs}` : ""}`;

    const response = await this.fetch(url, {
      method: "GET",
      headers: this.createHeaders(),
    });

    return this.handleResponse(response, SpinHistorySchema);
  }
}

export const defaultApiClient = new ApiClient();

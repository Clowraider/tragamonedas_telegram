import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  PlayerSnapshot,
  SpinRepresentation,
  SpinHistory,
} from "@slot-machine/contracts";

import { ApiClient, ApiClientError } from "../src/api.js";

describe("ApiClient", () => {
  const mockPlayerSnapshot: PlayerSnapshot = {
    playerId: "a0000000-0000-0000-0000-000000000001",
    balance: 1000,
    stake: 10,
    gameVersion: "classic-1",
    recentRound: null,
  };

  const mockSpinRepresentation: SpinRepresentation = {
    roundId: "b0000000-0000-0000-0000-000000000001",
    status: "settled",
    symbols: ["seven", "seven", "seven"],
    stake: 10,
    payout: 500,
    balanceBefore: 1000,
    balanceAfter: 1490,
    gameVersion: "classic-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  };

  const mockSpinHistory: SpinHistory = {
    items: [mockSpinRepresentation],
    nextCursor: null,
  };

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it("fetches player snapshot via getMe() with custom initData and request ID", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockPlayerSnapshot), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-123",
        },
      }),
    );

    const client = new ApiClient({
      baseUrl: "http://localhost:3000",
      getInitData: () => "valid-tg-init-data",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.getMe();
    expect(result).toEqual(mockPlayerSnapshot);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/v1/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-telegram-init-data": "valid-tg-init-data",
          "x-request-id": expect.any(String),
        }),
      }),
    );
  });

  it("submits a spin with Idempotency-Key and parameters", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSpinRepresentation), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-spin-1",
        },
      }),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.spin({
      idempotencyKey: "c0000000-0000-0000-0000-000000000001",
      stake: 10,
      gameVersion: "classic-1",
    });

    expect(result).toEqual(mockSpinRepresentation);
    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/spins",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "c0000000-0000-0000-0000-000000000001",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          stake: 10,
          gameVersion: "classic-1",
        }),
      }),
    );
  });

  it("fetches a single round by ID via getRound()", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSpinRepresentation), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const roundId = "b0000000-0000-0000-0000-000000000001";
    const result = await client.getRound(roundId);
    expect(result).toEqual(mockSpinRepresentation);
    expect(mockFetch).toHaveBeenCalledWith(
      `/v1/spins/${roundId}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetches history with query parameters via getHistory()", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockSpinHistory), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await client.getHistory({
      limit: 10,
      cursor: "b0000000-0000-0000-0000-000000000001",
    });

    expect(result).toEqual(mockSpinHistory);
    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/spins?limit=10&cursor=b0000000-0000-0000-0000-000000000001",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws typed ApiClientError on 422 INSUFFICIENT_CREDITS", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "INSUFFICIENT_CREDITS",
          message: "Insufficient balance to cover spin stake",
          requestId: "req-err-422",
        }),
        {
          status: 422,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "req-err-422",
          },
        },
      ),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.spin({
        idempotencyKey: "c0000000-0000-0000-0000-000000000001",
        stake: 10,
        gameVersion: "classic-1",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("INSUFFICIENT_CREDITS");
      expect(apiErr.message).toBe("Insufficient balance to cover spin stake");
      expect(apiErr.requestId).toBe("req-err-422");
      expect(apiErr.status).toBe(422);
      return true;
    });
  });

  it("throws typed ApiClientError on 409 IDEMPOTENCY_CONFLICT", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "IDEMPOTENCY_CONFLICT",
          message: "Idempotency key was previously used with different terms",
          requestId: "req-err-409",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "req-err-409",
          },
        },
      ),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.spin({
        idempotencyKey: "c0000000-0000-0000-0000-000000000001",
        stake: 10,
        gameVersion: "classic-1",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("IDEMPOTENCY_CONFLICT");
      expect(apiErr.status).toBe(409);
      return true;
    });
  });

  it("handles network / malformed response errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );

    const client = new ApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.getMe()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe("INTERNAL_ERROR");
      expect(apiErr.status).toBe(502);
      return true;
    });
  });
});

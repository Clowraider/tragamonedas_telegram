import type {
  AdminAdjustBalanceRequest,
  AdminAdjustBalanceResponse,
  AdminAuditLog,
  AdminMetrics,
  AdminPlayer,
  AdminSpinFeedItem,
  ErrorCode,
  SlotSymbol,
} from "@slot-machine/contracts";
import pg from "pg";

export class AdminServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}

export class AdminService {
  constructor(private readonly pool: pg.Pool) {}

  async getMetrics(): Promise<AdminMetrics> {
    const playersRes = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM players",
    );
    const totalPlayers = parseInt(playersRes.rows[0]?.count ?? "0", 10);

    const walletRes = await this.pool.query<{ sum: string }>(
      "SELECT COALESCE(SUM(balance), 0) AS sum FROM wallets",
    );
    const circulatingCredits = parseInt(walletRes.rows[0]?.sum ?? "0", 10);

    const spinsRes = await this.pool.query<{
      count: string;
      total_stake: string;
      total_payout: string;
      winning_count: string;
      jackpot_count: string;
      jackpot_payout: string;
    }>(
      `SELECT
        COUNT(*) AS count,
        COALESCE(SUM(stake), 0) AS total_stake,
        COALESCE(SUM(payout), 0) AS total_payout,
        COALESCE(COUNT(*) FILTER (WHERE payout > 0), 0) AS winning_count,
        COALESCE(COUNT(*) FILTER (WHERE payout >= stake * 50), 0) AS jackpot_count,
        COALESCE(SUM(payout) FILTER (WHERE payout >= stake * 50), 0) AS jackpot_payout
      FROM spin_rounds`,
    );

    const totalSpins = parseInt(spinsRes.rows[0]?.count ?? "0", 10);
    const totalWagered = parseInt(spinsRes.rows[0]?.total_stake ?? "0", 10);
    const totalPaidOut = parseInt(spinsRes.rows[0]?.total_payout ?? "0", 10);
    const winningSpinsCount = parseInt(
      spinsRes.rows[0]?.winning_count ?? "0",
      10,
    );
    const jackpotSpinsCount = parseInt(
      spinsRes.rows[0]?.jackpot_count ?? "0",
      10,
    );
    const jackpotPaidOut = parseInt(
      spinsRes.rows[0]?.jackpot_payout ?? "0",
      10,
    );

    const grossGamingRevenue = totalWagered - totalPaidOut;
    const observedRtpPercent =
      totalWagered > 0
        ? Number(((totalPaidOut / totalWagered) * 100).toFixed(2))
        : 0;
    const globalWinRatePercent =
      totalSpins > 0
        ? Number(((winningSpinsCount / totalSpins) * 100).toFixed(2))
        : 0;

    // Symbol frequencies across all stops
    const symbolRes = await this.pool.query<{ symbol: SlotSymbol; count: string }>(
      `SELECT unnest(symbols) AS symbol, COUNT(*) AS count
         FROM spin_rounds
        GROUP BY unnest(symbols)
        ORDER BY count DESC`,
    );

    const totalStops = totalSpins * 3;
    const symbolFrequencies = symbolRes.rows.map((r) => {
      const count = parseInt(r.count, 10);
      return {
        symbol: r.symbol,
        count,
        percentage:
          totalStops > 0 ? Number(((count / totalStops) * 100).toFixed(2)) : 0,
      };
    });

    return {
      totalPlayers,
      circulatingCredits,
      totalSpins,
      totalWagered,
      totalPaidOut,
      grossGamingRevenue,
      winningSpinsCount,
      globalWinRatePercent,
      jackpotSpinsCount,
      jackpotPaidOut,
      observedRtpPercent,
      symbolFrequencies,
    };
  }

  async listPlayers(params: {
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ players: AdminPlayer[]; total: number }> {
    const values: (string | number)[] = [];
    let whereClause = "";

    if (params.search && params.search.trim().length > 0) {
      values.push(`%${params.search.trim()}%`);
      whereClause = `WHERE (p.username ILIKE $1 OR p.first_name ILIKE $1 OR p.provider_subject ILIKE $1 OR p.id::text ILIKE $1)`;
    }

    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM players p ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);

    const selectQuery = `
      SELECT
        p.id,
        p.auth_provider,
        p.provider_subject,
        p.username,
        p.first_name,
        COALESCE(w.balance, 0) AS balance,
        p.created_at,
        p.updated_at,
        COALESCE(s.total_spins, 0) AS total_spins,
        COALESCE(s.total_wagered, 0) AS total_wagered,
        COALESCE(s.total_won, 0) AS total_won,
        COALESCE(s.winning_spins, 0) AS winning_spins,
        COALESCE(s.biggest_win_amount, 0) AS biggest_win_amount,
        COALESCE(s.biggest_win_multiplier, 0) AS biggest_win_multiplier,
        s.favorite_stake,
        s.last_spin_at
      FROM players p
      LEFT JOIN wallets w ON w.player_id = p.id
      LEFT JOIN (
        SELECT
          player_id,
          COUNT(*) AS total_spins,
          SUM(stake) AS total_wagered,
          SUM(payout) AS total_won,
          COUNT(*) FILTER (WHERE payout > 0) AS winning_spins,
          MAX(payout) AS biggest_win_amount,
          MAX(CASE WHEN stake > 0 THEN payout::float / stake ELSE 0 END) AS biggest_win_multiplier,
          MODE() WITHIN GROUP (ORDER BY stake) AS favorite_stake,
          MAX(created_at) AS last_spin_at
        FROM spin_rounds
        GROUP BY player_id
      ) s ON s.player_id = p.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const result = await this.pool.query<{
      id: string;
      auth_provider: string;
      provider_subject: string;
      username: string | null;
      first_name: string | null;
      balance: number;
      created_at: Date;
      updated_at: Date;
      total_spins: string;
      total_wagered: string;
      total_won: string;
      winning_spins: string;
      biggest_win_amount: string;
      biggest_win_multiplier: number;
      favorite_stake: number | null;
      last_spin_at: Date | null;
    }>(selectQuery, [...values, limit, offset]);

    // Fetch streak analytics for these players
    const playerIds = result.rows.map((r) => r.id);
    const streaksMap = new Map<
      string,
      { maxStreak: number; currentStreak: number }
    >();

    if (playerIds.length > 0) {
      const streakRes = await this.pool.query<{
        player_id: string;
        payout: number;
      }>(
        `SELECT player_id, payout
           FROM spin_rounds
          WHERE player_id = ANY($1::uuid[])
          ORDER BY player_id, created_at ASC`,
        [playerIds],
      );

      // Calculate max winning streak & current streak per player
      const playerSpins = new Map<string, number[]>();
      for (const row of streakRes.rows) {
        const list = playerSpins.get(row.player_id) ?? [];
        list.push(row.payout);
        playerSpins.set(row.player_id, list);
      }

      for (const [pId, payouts] of playerSpins.entries()) {
        let maxStreak = 0;
        let tempStreak = 0;
        let currentStreak = 0;

        for (const payout of payouts) {
          if (payout > 0) {
            tempStreak += 1;
            if (tempStreak > maxStreak) {
              maxStreak = tempStreak;
            }
            currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
          } else {
            tempStreak = 0;
            currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
          }
        }
        streaksMap.set(pId, { maxStreak, currentStreak });
      }
    }

    const players: AdminPlayer[] = result.rows.map((row) => {
      const totalSpins = parseInt(row.total_spins, 10);
      const totalWagered = parseInt(row.total_wagered, 10);
      const totalWon = parseInt(row.total_won, 10);
      const winningSpins = parseInt(row.winning_spins, 10);
      const netProfit = totalWon - totalWagered;
      const winRatePercent =
        totalSpins > 0
          ? Number(((winningSpins / totalSpins) * 100).toFixed(2))
          : 0;
      const biggestWinAmount = parseInt(row.biggest_win_amount, 10);
      const biggestWinMultiplier = Number(
        (row.biggest_win_multiplier || 0).toFixed(2),
      );

      const streakData = streaksMap.get(row.id) ?? {
        maxStreak: 0,
        currentStreak: 0,
      };

      return {
        id: row.id,
        authProvider: row.auth_provider,
        providerSubject: row.provider_subject,
        username: row.username,
        firstName: row.first_name,
        balance: row.balance,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        stats: {
          totalSpins,
          totalWagered,
          totalWon,
          netProfit,
          winRatePercent,
          biggestWinAmount,
          biggestWinMultiplier,
          maxWinningStreak: streakData.maxStreak,
          currentStreakCount: streakData.currentStreak,
          favoriteStake: row.favorite_stake !== null ? Number(row.favorite_stake) : null,
          lastSpinAt: row.last_spin_at ? row.last_spin_at.toISOString() : null,
        },
      };
    });

    return { players, total };
  }

  async adjustBalance(
    playerId: string,
    request: AdminAdjustBalanceRequest,
    adminIdentifier = "system",
  ): Promise<AdminAdjustBalanceResponse> {
    const reason = request.reason ? request.reason.trim() : "";
    if (reason.length === 0) {
      throw new AdminServiceError(
        "BAD_REQUEST",
        "Adjustment reason is required and cannot be blank",
      );
    }

    if (!["grant", "deduct", "set"].includes(request.action)) {
      throw new AdminServiceError(
        "BAD_REQUEST",
        `Invalid adjustment action: ${request.action}`,
      );
    }

    if (!Number.isInteger(request.amount) || request.amount < 0) {
      throw new AdminServiceError(
        "BAD_REQUEST",
        "Amount must be a non-negative integer",
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const walletRes = await client.query<{ balance: number }>(
        "SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE",
        [playerId],
      );
      const wallet = walletRes.rows[0];
      if (!wallet) {
        throw new AdminServiceError(
          "NOT_FOUND",
          `Player or wallet not found for id: ${playerId}`,
        );
      }

      const balanceBefore = wallet.balance;
      let balanceAfter: number;

      if (request.action === "grant") {
        balanceAfter = balanceBefore + request.amount;
      } else if (request.action === "deduct") {
        if (balanceBefore < request.amount) {
          throw new AdminServiceError(
            "INSUFFICIENT_CREDITS",
            `Cannot deduct ${request.amount} credits from player balance of ${balanceBefore}`,
          );
        }
        balanceAfter = balanceBefore - request.amount;
      } else if (request.action === "set") {
        balanceAfter = request.amount;
      } else {
        throw new AdminServiceError("BAD_REQUEST", "Invalid action");
      }

      await client.query(
        "UPDATE wallets SET balance = $1, version = version + 1 WHERE player_id = $2",
        [balanceAfter, playerId],
      );

      const auditRes = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO admin_audit_logs (
          player_id,
          action_type,
          amount,
          balance_before,
          balance_after,
          reason,
          admin_identifier
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at`,
        [
          playerId,
          request.action,
          request.amount,
          balanceBefore,
          balanceAfter,
          reason,
          adminIdentifier,
        ],
      );

      const auditLog = auditRes.rows[0];
      if (!auditLog) {
        throw new AdminServiceError(
          "INTERNAL_ERROR",
          "Failed to write admin audit log",
        );
      }

      await client.query("COMMIT");

      return {
        playerId,
        balanceBefore,
        balanceAfter,
        auditLogId: auditLog.id,
        createdAt: auditLog.created_at.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async listRecentSpins(limit = 50): Promise<AdminSpinFeedItem[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const query = `
      SELECT
        s.id AS round_id,
        s.player_id,
        p.username,
        p.first_name,
        s.stake,
        s.payout,
        s.symbols,
        s.balance_before,
        s.balance_after,
        s.created_at
      FROM spin_rounds s
      LEFT JOIN players p ON p.id = s.player_id
      ORDER BY s.created_at DESC
      LIMIT $1
    `;

    const result = await this.pool.query<{
      round_id: string;
      player_id: string;
      username: string | null;
      first_name: string | null;
      stake: number;
      payout: number;
      symbols: string[];
      balance_before: number;
      balance_after: number;
      created_at: Date;
    }>(query, [cappedLimit]);

    return result.rows.map((row) => ({
      roundId: row.round_id,
      playerId: row.player_id,
      username: row.username,
      firstName: row.first_name,
      stake: row.stake,
      payout: row.payout,
      symbols: [row.symbols[0], row.symbols[1], row.symbols[2]] as [
        SlotSymbol,
        SlotSymbol,
        SlotSymbol,
      ],
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async listAuditLogs(params: {
    playerId?: string | undefined;
    limit?: number | undefined;
  }): Promise<AdminAuditLog[]> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const values: (string | number)[] = [];
    let whereClause = "";

    if (params.playerId) {
      values.push(params.playerId);
      whereClause = "WHERE a.player_id = $1";
    }

    const query = `
      SELECT
        a.id,
        a.player_id,
        p.username,
        a.action_type,
        a.amount,
        a.balance_before,
        a.balance_after,
        a.reason,
        a.admin_identifier,
        a.created_at
      FROM admin_audit_logs a
      LEFT JOIN players p ON p.id = a.player_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${values.length + 1}
    `;

    const result = await this.pool.query<{
      id: string;
      player_id: string;
      username: string | null;
      action_type: "grant" | "deduct" | "set";
      amount: number;
      balance_before: number;
      balance_after: number;
      reason: string;
      admin_identifier: string;
      created_at: Date;
    }>(query, [...values, limit]);

    return result.rows.map((row) => ({
      id: row.id,
      playerId: row.player_id,
      username: row.username,
      actionType: row.action_type,
      amount: row.amount,
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      reason: row.reason,
      adminIdentifier: row.admin_identifier,
      createdAt: row.created_at.toISOString(),
    }));
  }
}

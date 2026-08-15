import type { FastifyInstance } from "fastify";
import pg from "pg";

export type MetricsState = {
  spinsTotal: number;
  spinsAccepted: number;
  spinsRejected: number;
  spinsIdempotent: number;
  spinsInsufficientFunds: number;
  settlementFailures: number;
  latencySumMs: number;
  latencyCount: number;
};

function createMetricsState(): MetricsState {
  return {
    spinsTotal: 0,
    spinsAccepted: 0,
    spinsRejected: 0,
    spinsIdempotent: 0,
    spinsInsufficientFunds: 0,
    settlementFailures: 0,
    latencySumMs: 0,
    latencyCount: 0,
  };
}

export async function metricsRoute(app: FastifyInstance): Promise<void> {
  const pool: pg.Pool = (app as unknown as { pool: pg.Pool }).pool;
  const metrics = createMetricsState();
  (app as unknown as { metrics: MetricsState }).metrics = metrics;

  app.addHook("onResponse", async (request, reply) => {
    if (
      request.method === "POST" &&
      request.url.startsWith("/v1/spins")
    ) {
      metrics.spinsTotal++;
      const elapsed = reply.elapsedTime;
      metrics.latencySumMs += elapsed;
      metrics.latencyCount++;

      const status = reply.statusCode;
      if (status === 201) {
        metrics.spinsAccepted++;
      } else if (status === 200) {
        metrics.spinsIdempotent++;
      } else if (status === 422) {
        metrics.spinsRejected++;
        // Check if body was an insufficient funds error
        metrics.spinsInsufficientFunds++;
      } else if (status >= 500) {
        metrics.settlementFailures++;
      } else {
        metrics.spinsRejected++;
      }
    }
  });

  app.get("/metrics", async (_request, reply) => {
    let dbReady = false;
    try {
      await pool.query("SELECT 1");
      dbReady = true;
    } catch {
      // DB is not ready
    }

    const avgLatencyMs =
      metrics.latencyCount > 0
        ? (metrics.latencySumMs / metrics.latencyCount).toFixed(2)
        : "0.00";

    const lines = [
      `# HELP spins_total Total spin requests`,
      `# TYPE spins_total counter`,
      `spins_total ${metrics.spinsTotal}`,
      `# HELP spins_accepted Accepted (new) spins`,
      `# TYPE spins_accepted counter`,
      `spins_accepted ${metrics.spinsAccepted}`,
      `# HELP spins_rejected Rejected spin requests`,
      `# TYPE spins_rejected counter`,
      `spins_rejected ${metrics.spinsRejected}`,
      `# HELP spins_idempotent Idempotent replay responses`,
      `# TYPE spins_idempotent counter`,
      `spins_idempotent ${metrics.spinsIdempotent}`,
      `# HELP spins_insufficient_funds Insufficient funds rejections`,
      `# TYPE spins_insufficient_funds counter`,
      `spins_insufficient_funds ${metrics.spinsInsufficientFunds}`,
      `# HELP settlement_failures Internal settlement failures`,
      `# TYPE settlement_failures counter`,
      `settlement_failures ${metrics.settlementFailures}`,
      `# HELP spin_latency_avg_ms Average spin latency in milliseconds`,
      `# TYPE spin_latency_avg_ms gauge`,
      `spin_latency_avg_ms ${avgLatencyMs}`,
      `# HELP db_ready Database readiness`,
      `# TYPE db_ready gauge`,
      `db_ready ${dbReady ? 1 : 0}`,
    ];

    reply.header("content-type", "text/plain; version=0.0.4").send(
      lines.join("\n") + "\n",
    );
  });
}

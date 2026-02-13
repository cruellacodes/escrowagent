import Fastify from "fastify";
import cors from "@fastify/cors";
import * as db from "./db";

// ──────────────────────────────────────────────────────
// REST API — serves indexed data for SDKs and dashboard
// ──────────────────────────────────────────────────────

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN || "*",
  });

  // ── Health check ──
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // ── Protocol config ──
  app.get("/config", async (request, reply) => {
    const config = await db.getProtocolConfig();
    if (!config) {
      return reply.code(404).send({ error: "Protocol config not initialized" });
    }
    return {
      adminAddress: config.admin_address,
      feeWallet: config.fee_wallet,
      protocolFeeBps: config.protocol_fee_bps,
      arbitratorFeeBps: config.arbitrator_fee_bps,
      minEscrowAmount: config.min_escrow_amount,
      maxEscrowAmount: config.max_escrow_amount,
      paused: config.paused,
      updatedAt: config.updated_at?.toISOString() ?? null,
    };
  });

  // ── Escrows ──

  app.get("/escrows", async (request, reply) => {
    const {
      status,
      client,
      provider,
      limit = "50",
      offset = "0",
    } = request.query as Record<string, string>;

    let sql = "SELECT * FROM escrows WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (client) {
      sql += ` AND client_address = $${paramIndex++}`;
      params.push(client);
    }
    if (provider) {
      sql += ` AND provider_address = $${paramIndex++}`;
      params.push(provider);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.query(sql, params);
    return result.rows;
  });

  app.get("/escrows/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    const result = await db.query(
      "SELECT * FROM escrows WHERE escrow_address = $1",
      [address]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Escrow not found" });
    }

    // Enrich with task and proof data
    const escrow = result.rows[0];
    const [taskResult, proofResult] = await Promise.all([
      db.query("SELECT * FROM tasks WHERE task_hash = $1", [escrow.task_hash]),
      db.query(
        "SELECT * FROM proofs WHERE escrow_address = $1 ORDER BY submitted_at DESC",
        [address]
      ),
    ]);

    return {
      ...escrow,
      task: taskResult.rows[0] || null,
      proofs: proofResult.rows,
    };
  });

  app.get("/escrows/:address/proof", async (request, reply) => {
    const { address } = request.params as { address: string };
    const result = await db.query(
      "SELECT * FROM proofs WHERE escrow_address = $1 ORDER BY submitted_at DESC",
      [address]
    );
    return result.rows;
  });

  app.get("/escrows/:address/dispute", async (request, reply) => {
    const { address } = request.params as { address: string };
    const result = await db.query(
      "SELECT * FROM disputes WHERE escrow_address = $1 ORDER BY raised_at DESC",
      [address]
    );
    return result.rows;
  });

  // ── Agents ──

  app.get("/agents/:address/stats", async (request, reply) => {
    const { address } = request.params as { address: string };
    const result = await db.query(
      "SELECT * FROM agent_stats WHERE agent_address = $1",
      [address]
    );

    if (result.rows.length === 0) {
      return {
        agent_address: address,
        total_escrows: 0,
        completed_escrows: 0,
        disputed_escrows: 0,
        expired_escrows: 0,
        total_volume: 0,
        success_rate: 0,
        avg_completion_time: 0,
        last_active: null,
      };
    }

    return result.rows[0];
  });

  app.get("/agents/:address/escrows", async (request, reply) => {
    const { address } = request.params as { address: string };
    const { limit = "50", offset = "0" } = request.query as Record<string, string>;

    const result = await db.query(
      `SELECT * FROM escrows
       WHERE client_address = $1 OR provider_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [address, parseInt(limit, 10), parseInt(offset, 10)]
    );
    return result.rows;
  });

  // ── Tasks (off-chain storage) ──

  app.post("/tasks", async (request, reply) => {
    const { task_hash, description, criteria, metadata } = request.body as {
      task_hash: string;
      description: string;
      criteria: any;
      metadata?: any;
    };

    if (!task_hash || !description) {
      return reply.code(400).send({ error: "task_hash and description required" });
    }

    await db.insertTask({ task_hash, description, criteria: criteria || [], metadata });
    return reply.code(201).send({ ok: true, task_hash });
  });

  app.get("/tasks/:hash", async (request, reply) => {
    const { hash } = request.params as { hash: string };
    const result = await db.query(
      "SELECT * FROM tasks WHERE task_hash = $1",
      [hash]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "Task not found" });
    }
    return result.rows[0];
  });

  // ── Disputes (off-chain storage) ──

  app.post("/disputes", async (request, reply) => {
    const { escrow_address, raised_by, reason } = request.body as {
      escrow_address: string;
      raised_by: string;
      reason: string;
    };

    if (!escrow_address || !raised_by || !reason) {
      return reply.code(400).send({ error: "escrow_address, raised_by, and reason required" });
    }

    await db.insertDispute({ escrow_address, raised_by, reason });
    return reply.code(201).send({ ok: true });
  });

  // ── Protocol Stats ──

  app.get("/stats", async () => {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_escrows,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) FILTER (WHERE status = 'Active') as active,
        COUNT(*) FILTER (WHERE status = 'Disputed') as disputed,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) as completed_volume
      FROM escrows
    `);

    const stats = result.rows[0];
    return {
      totalEscrows: parseInt(stats.total_escrows, 10),
      completedEscrows: parseInt(stats.completed, 10),
      activeEscrows: parseInt(stats.active, 10),
      disputedEscrows: parseInt(stats.disputed, 10),
      totalVolume: parseInt(stats.total_volume, 10),
      completedVolume: parseInt(stats.completed_volume, 10),
    };
  });

  // ── Analytics (detailed protocol metrics) ──

  app.get("/analytics", async () => {
    // 1. Per-chain breakdown
    const chainStats = await db.query(`
      SELECT
        chain,
        COUNT(*) as total_escrows,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) FILTER (WHERE status = 'Active' OR status = 'AwaitingProvider' OR status = 'ProofSubmitted') as active,
        COUNT(*) FILTER (WHERE status = 'Disputed') as disputed,
        COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'Expired') as expired,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) as settled_volume,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('Active', 'AwaitingProvider', 'ProofSubmitted', 'Disputed')), 0) as locked_volume
      FROM escrows
      GROUP BY chain
    `);

    // 2. Weekly trend (last 12 weeks)
    const weeklyTrend = await db.query(`
      SELECT
        date_trunc('week', created_at)::date as week,
        chain,
        COUNT(*) as escrows_created,
        COALESCE(SUM(amount), 0) as volume
      FROM escrows
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY week, chain
      ORDER BY week ASC
    `);

    // 3. Active agents (unique addresses seen in last 30 days)
    const agentCounts = await db.query(`
      SELECT COUNT(DISTINCT addr) as active_agents FROM (
        SELECT client_address as addr FROM escrows WHERE updated_at >= NOW() - INTERVAL '30 days'
        UNION
        SELECT provider_address as addr FROM escrows WHERE updated_at >= NOW() - INTERVAL '30 days'
      ) combined
    `);

    // 4. Top agents by volume
    const topAgents = await db.query(`
      SELECT
        addr as address,
        COUNT(*) as total_escrows,
        COALESCE(SUM(amount), 0) as total_volume,
        COUNT(*) FILTER (WHERE status = 'Completed') as completed
      FROM (
        SELECT client_address as addr, amount, status FROM escrows
        UNION ALL
        SELECT provider_address as addr, amount, status FROM escrows
      ) combined
      GROUP BY addr
      ORDER BY total_volume DESC
      LIMIT 10
    `);

    // 5. Completion rate & average time
    const performance = await db.query(`
      SELECT
        chain,
        CASE WHEN COUNT(*) FILTER (WHERE status IN ('Completed', 'Disputed', 'Resolved', 'Expired', 'Cancelled')) > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE status = 'Completed')::numeric * 100 /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('Completed', 'Disputed', 'Resolved', 'Expired', 'Cancelled')), 0),
            1
          )
          ELSE 0
        END as completion_rate,
        CASE WHEN COUNT(*) FILTER (WHERE status IN ('Disputed', 'Resolved')) > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE status IN ('Disputed', 'Resolved'))::numeric * 100 /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('Completed', 'Disputed', 'Resolved', 'Expired', 'Cancelled')), 0),
            1
          )
          ELSE 0
        END as dispute_rate,
        COALESCE(
          ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::numeric, 0)
          FILTER (WHERE status = 'Completed' AND completed_at IS NOT NULL),
          0
        ) as avg_completion_seconds
      FROM escrows
      GROUP BY chain
    `);

    // 6. Daily volume (last 30 days, for sparkline chart)
    const dailyVolume = await db.query(`
      SELECT
        date_trunc('day', created_at)::date as day,
        COUNT(*) as escrows,
        COALESCE(SUM(amount), 0) as volume
      FROM escrows
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `);

    // Build per-chain stats map
    const chains: Record<string, any> = {};
    for (const row of chainStats.rows) {
      chains[row.chain || "solana"] = {
        totalEscrows: parseInt(row.total_escrows, 10),
        completed: parseInt(row.completed, 10),
        active: parseInt(row.active, 10),
        disputed: parseInt(row.disputed, 10),
        cancelled: parseInt(row.cancelled, 10),
        expired: parseInt(row.expired, 10),
        totalVolume: parseInt(row.total_volume, 10),
        settledVolume: parseInt(row.settled_volume, 10),
        lockedVolume: parseInt(row.locked_volume, 10),
      };
    }

    const perfMap: Record<string, any> = {};
    for (const row of performance.rows) {
      perfMap[row.chain || "solana"] = {
        completionRate: parseFloat(row.completion_rate),
        disputeRate: parseFloat(row.dispute_rate),
        avgCompletionSeconds: parseInt(row.avg_completion_seconds, 10),
      };
    }

    return {
      chains,
      performance: perfMap,
      activeAgents: parseInt(agentCounts.rows[0]?.active_agents || "0", 10),
      topAgents: topAgents.rows.map((r: any) => ({
        address: r.address,
        totalEscrows: parseInt(r.total_escrows, 10),
        totalVolume: parseInt(r.total_volume, 10),
        completed: parseInt(r.completed, 10),
      })),
      weeklyTrend: weeklyTrend.rows.map((r: any) => ({
        week: r.week,
        chain: r.chain || "solana",
        escrowsCreated: parseInt(r.escrows_created, 10),
        volume: parseInt(r.volume, 10),
      })),
      dailyVolume: dailyVolume.rows.map((r: any) => ({
        day: r.day,
        escrows: parseInt(r.escrows, 10),
        volume: parseInt(r.volume, 10),
      })),
    };
  });

  return app;
}

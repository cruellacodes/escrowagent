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

  return app;
}

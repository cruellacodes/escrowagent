import { Pool, PoolClient } from "pg";

// ──────────────────────────────────────────────────────
// Database connection pool
// ──────────────────────────────────────────────────────

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://localhost:5432/escrowagent",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// ──────────────────────────────────────────────────────
// Schema migration
// ──────────────────────────────────────────────────────

const MIGRATION_SQL = `
-- Core escrow records (indexed from on-chain events)
CREATE TABLE IF NOT EXISTS escrows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_address VARCHAR(44) UNIQUE NOT NULL,
    client_address VARCHAR(44) NOT NULL,
    provider_address VARCHAR(44) NOT NULL,
    arbitrator_address VARCHAR(44),
    token_mint VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    protocol_fee_bps SMALLINT NOT NULL DEFAULT 50,
    status VARCHAR(20) NOT NULL DEFAULT 'AwaitingProvider',
    verification_type VARCHAR(20) NOT NULL,
    task_hash VARCHAR(64) NOT NULL,
    deadline TIMESTAMP NOT NULL,
    grace_period INTEGER NOT NULL DEFAULT 300,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    tx_signature VARCHAR(88)
);

-- Full task descriptions (stored off-chain, hash on-chain)
CREATE TABLE IF NOT EXISTS tasks (
    task_hash VARCHAR(64) PRIMARY KEY,
    description TEXT NOT NULL,
    criteria JSONB NOT NULL DEFAULT '[]',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Proof submissions
CREATE TABLE IF NOT EXISTS proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_address VARCHAR(44) REFERENCES escrows(escrow_address),
    proof_type VARCHAR(30) NOT NULL,
    proof_data TEXT NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    verified BOOLEAN DEFAULT FALSE
);

-- Dispute records
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_address VARCHAR(44) REFERENCES escrows(escrow_address),
    raised_by VARCHAR(44) NOT NULL,
    reason TEXT NOT NULL,
    ruling VARCHAR(20),
    ruling_details JSONB,
    raised_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- Agent reputation / stats (materialized view, updated on events)
CREATE TABLE IF NOT EXISTS agent_stats (
    agent_address VARCHAR(44) PRIMARY KEY,
    total_escrows INTEGER DEFAULT 0,
    completed_escrows INTEGER DEFAULT 0,
    disputed_escrows INTEGER DEFAULT 0,
    expired_escrows INTEGER DEFAULT 0,
    total_volume BIGINT DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_completion_time INTEGER DEFAULT 0,
    last_active TIMESTAMP
);

-- Protocol config (indexed from ProtocolInitialized / ProtocolConfigUpdated events)
CREATE TABLE IF NOT EXISTS protocol_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_address VARCHAR(44) NOT NULL,
    fee_wallet VARCHAR(44) NOT NULL,
    protocol_fee_bps SMALLINT NOT NULL,
    arbitrator_fee_bps SMALLINT NOT NULL,
    min_escrow_amount BIGINT NOT NULL,
    max_escrow_amount BIGINT NOT NULL,
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_escrows_client ON escrows(client_address);
CREATE INDEX IF NOT EXISTS idx_escrows_provider ON escrows(provider_address);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
CREATE INDEX IF NOT EXISTS idx_escrows_deadline ON escrows(deadline);
CREATE INDEX IF NOT EXISTS idx_escrows_created ON escrows(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_escrow ON proofs(escrow_address);
CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_address);
`;

export async function migrate() {
  console.log("Running database migration...");
  await query(MIGRATION_SQL);
  console.log("Migration complete.");
}

// ──────────────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────────────

export async function upsertEscrow(escrow: {
  escrow_address: string;
  client_address: string;
  provider_address: string;
  arbitrator_address?: string;
  token_mint: string;
  amount: number;
  status: string;
  verification_type: string;
  task_hash: string;
  deadline: Date;
  grace_period: number;
  tx_signature?: string;
}) {
  return query(
    `INSERT INTO escrows (
      escrow_address, client_address, provider_address, arbitrator_address,
      token_mint, amount, status, verification_type, task_hash,
      deadline, grace_period, tx_signature
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (escrow_address)
    DO UPDATE SET status = $7, updated_at = NOW()`,
    [
      escrow.escrow_address,
      escrow.client_address,
      escrow.provider_address,
      escrow.arbitrator_address || null,
      escrow.token_mint,
      escrow.amount,
      escrow.status,
      escrow.verification_type,
      escrow.task_hash,
      escrow.deadline,
      escrow.grace_period,
      escrow.tx_signature || null,
    ]
  );
}

export async function updateEscrowStatus(
  escrowAddress: string,
  status: string,
  completedAt?: Date
) {
  return query(
    `UPDATE escrows SET status = $1, updated_at = NOW(), completed_at = $3 WHERE escrow_address = $2`,
    [status, escrowAddress, completedAt || null]
  );
}

export async function insertTask(task: {
  task_hash: string;
  description: string;
  criteria: any;
  metadata?: any;
}) {
  return query(
    `INSERT INTO tasks (task_hash, description, criteria, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (task_hash) DO NOTHING`,
    [task.task_hash, task.description, JSON.stringify(task.criteria), task.metadata ? JSON.stringify(task.metadata) : null]
  );
}

export async function insertProof(proof: {
  escrow_address: string;
  proof_type: string;
  proof_data: string;
}) {
  return query(
    `INSERT INTO proofs (escrow_address, proof_type, proof_data) VALUES ($1, $2, $3)`,
    [proof.escrow_address, proof.proof_type, proof.proof_data]
  );
}

export async function insertDispute(dispute: {
  escrow_address: string;
  raised_by: string;
  reason: string;
}) {
  return query(
    `INSERT INTO disputes (escrow_address, raised_by, reason) VALUES ($1, $2, $3)`,
    [dispute.escrow_address, dispute.raised_by, dispute.reason]
  );
}

export async function upsertAgentStats(agentAddress: string) {
  return query(
    `INSERT INTO agent_stats (agent_address, total_escrows, last_active)
     VALUES ($1, 1, NOW())
     ON CONFLICT (agent_address)
     DO UPDATE SET
       total_escrows = agent_stats.total_escrows + 1,
       last_active = NOW()`,
    [agentAddress]
  );
}

export async function getProtocolConfig(): Promise<{
  admin_address: string;
  fee_wallet: string;
  protocol_fee_bps: number;
  arbitrator_fee_bps: number;
  min_escrow_amount: string;
  max_escrow_amount: string;
  paused: boolean;
  updated_at: Date | null;
} | null> {
  const result = await query(
    "SELECT admin_address, fee_wallet, protocol_fee_bps, arbitrator_fee_bps, min_escrow_amount, max_escrow_amount, paused, updated_at FROM protocol_config WHERE id = 1"
  );
  return result.rows[0] || null;
}

export async function upsertProtocolConfig(config: {
  admin_address: string;
  fee_wallet: string;
  protocol_fee_bps: number;
  arbitrator_fee_bps: number;
  min_escrow_amount: number;
  max_escrow_amount: number;
  paused?: boolean;
}) {
  return query(
    `INSERT INTO protocol_config (
      id, admin_address, fee_wallet, protocol_fee_bps, arbitrator_fee_bps,
      min_escrow_amount, max_escrow_amount, paused
    ) VALUES (1, $1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id)
    DO UPDATE SET
      admin_address = $1,
      fee_wallet = $2,
      protocol_fee_bps = $3,
      arbitrator_fee_bps = $4,
      min_escrow_amount = $5,
      max_escrow_amount = $6,
      paused = $7,
      updated_at = NOW()`,
    [
      config.admin_address,
      config.fee_wallet,
      config.protocol_fee_bps,
      config.arbitrator_fee_bps,
      config.min_escrow_amount,
      config.max_escrow_amount,
      config.paused ?? false,
    ]
  );
}

// If run directly, execute migration
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

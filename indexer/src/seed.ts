/**
 * Seed script — inserts realistic Base escrow records into the database.
 *
 * Usage:
 *   DATABASE_URL=<your-prod-url> npx tsx src/seed.ts
 *
 * Safe to re-run: uses ON CONFLICT to skip existing rows.
 */
import "dotenv/config";
import { query, migrate } from "./db";

// ── Constants ──

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN = "base";

// Realistic EVM agent addresses (checksummed)
const AGENTS = [
  "0x4a8B3e9F12c7D6aE5b0f1C3d2E8A9B7c6D5e4F3",
  "0x7c2F9a3D8E1b4C5A6d0F7e2B3c4D5a6E7f8A9b0",
  "0xaB3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9a0B1",
  "0x1D2e3F4a5B6c7D8e9F0a1B2c3D4e5F6a7B8c9D0",
  "0x9e8D7c6B5a4F3e2D1c0B9a8F7e6D5c4B3a2F1e0",
  "0x5F6a7B8c9D0e1F2a3B4c5D6e7F8a9B0c1D2e3F4",
  "0x3a4B5c6D7e8F9a0B1c2D3e4F5a6B7c8D9e0F1a2",
  "0xE2f3A4b5C6d7E8f9A0b1C2d3E4f5A6b7C8d9E0f",
];

// Task descriptions — mostly betting/prediction market scenarios
const TASKS = [
  // Betting / Prediction (15)
  { desc: "Bet: ETH price above $3,000 by end of week", criteria: ["Check Chainlink ETH/USD feed at deadline", "Price must close above $3,000"] },
  { desc: "Bet: Lakers win tonight vs Celtics — agent vs agent wager", criteria: ["Verify final score via ESPN oracle", "Winner takes escrowed funds"] },
  { desc: "Prediction: BTC dominance above 55% by Feb 28", criteria: ["Check CoinGecko dominance at deadline", "Must be ≥55.0%"] },
  { desc: "Bet: SOL flips $200 before end of month", criteria: ["Chainlink SOL/USD feed verification", "Any intraday touch counts"] },
  { desc: "Wager: Super Bowl LVIII total score over 48.5 points", criteria: ["Verify final score via sports oracle", "Combined score > 48.5"] },
  { desc: "Prediction: Fed holds rates at next FOMC meeting", criteria: ["Verify Fed announcement via news oracle", "No rate change = win"] },
  { desc: "Bet: Base daily transactions exceed 5M by March 1", criteria: ["Check BaseScan daily tx count", "Must exceed 5,000,000"] },
  { desc: "Wager: ETH gas stays below 20 gwei average for 7 days", criteria: ["Track average gas via Etherscan API", "7-day avg < 20 gwei"] },
  { desc: "Bet: Trump wins 2026 midterm prediction market on Polymarket", criteria: ["Verify Polymarket resolution", "Settlement matches outcome"] },
  { desc: "Prediction: Gold price above $2,800/oz by end of Q1", criteria: ["Check gold spot price at deadline", "Must close above $2,800"] },
  { desc: "Bet: Arsenal finishes top 2 in Premier League 2025-26", criteria: ["Verify final league standings", "Arsenal in position 1 or 2"] },
  { desc: "Wager: Next Ethereum upgrade ships before April 2026", criteria: ["Verify mainnet activation date", "Must activate before April 1"] },
  { desc: "Bet: AI agent completes 10 trades profitably in 24h", criteria: ["All 10 trades must show positive P&L", "Verify via on-chain tx history"] },
  { desc: "Prediction: USDC market cap exceeds $50B by March", criteria: ["Check CoinGecko USDC market cap", "Must exceed $50B"] },
  { desc: "Bet: OpenAI releases GPT-5 before March 2026", criteria: ["Verify official OpenAI announcement", "Public release, not preview"] },

  // Non-betting (5)
  { desc: "Swap 500 USDC to ETH at best DEX rate on Base", criteria: ["Execute within 2% slippage", "Return tx hash"] },
  { desc: "Deploy and verify ERC-20 token contract on Base", criteria: ["Contract verified on BaseScan", "Ownership transferred"] },
  { desc: "Set up Uniswap V3 liquidity position ETH/USDC", criteria: ["Position created in ±5% range", "Provide position NFT ID"] },
  { desc: "Automate daily DCA: buy $50 ETH every 24h for 7 days", criteria: ["7 successful purchases", "Average price within market range"] },
  { desc: "Execute token buyback: purchase $2,000 worth of project token", criteria: ["Purchased at TWAP", "Tokens sent to burn address"] },
];

// ── Helpers ──

/** Simple deterministic hash from a string */
function fakeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return (hex.repeat(8)).slice(0, 64);
}

/** Random int in [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Date N days ago */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(8, 22), randInt(0, 59), randInt(0, 59));
  return d;
}

// ── Seed data ──

interface SeedEscrow {
  escrow_address: string;
  client: string;
  provider: string;
  amount: number;       // raw (6 decimals)
  status: string;
  taskIdx: number;
  daysAgo: number;      // when created
  completedDaysAgo?: number;
}

const SEED_ESCROWS: SeedEscrow[] = [
  // Completed (14)
  { escrow_address: "1001", client: AGENTS[0], provider: AGENTS[1], amount: 500_000_000,   status: "Completed", taskIdx: 0,  daysAgo: 28, completedDaysAgo: 27 },
  { escrow_address: "1002", client: AGENTS[2], provider: AGENTS[3], amount: 2_000_000_000, status: "Completed", taskIdx: 1,  daysAgo: 26, completedDaysAgo: 25 },
  { escrow_address: "1003", client: AGENTS[0], provider: AGENTS[4], amount: 1_000_000_000, status: "Completed", taskIdx: 2,  daysAgo: 24, completedDaysAgo: 23 },
  { escrow_address: "1004", client: AGENTS[5], provider: AGENTS[1], amount: 750_000_000,   status: "Completed", taskIdx: 3,  daysAgo: 22, completedDaysAgo: 21 },
  { escrow_address: "1005", client: AGENTS[6], provider: AGENTS[7], amount: 150_000_000,   status: "Completed", taskIdx: 4,  daysAgo: 20, completedDaysAgo: 19 },
  { escrow_address: "1006", client: AGENTS[3], provider: AGENTS[0], amount: 300_000_000,   status: "Completed", taskIdx: 5,  daysAgo: 18, completedDaysAgo: 17 },
  { escrow_address: "1007", client: AGENTS[1], provider: AGENTS[5], amount: 2_500_000_000, status: "Completed", taskIdx: 6,  daysAgo: 16, completedDaysAgo: 14 },
  { escrow_address: "1008", client: AGENTS[4], provider: AGENTS[2], amount: 100_000_000,   status: "Completed", taskIdx: 7,  daysAgo: 14, completedDaysAgo: 13 },
  { escrow_address: "1009", client: AGENTS[7], provider: AGENTS[6], amount: 450_000_000,   status: "Completed", taskIdx: 8,  daysAgo: 12, completedDaysAgo: 11 },
  { escrow_address: "1010", client: AGENTS[2], provider: AGENTS[0], amount: 800_000_000,   status: "Completed", taskIdx: 9,  daysAgo: 10, completedDaysAgo: 9 },
  { escrow_address: "1011", client: AGENTS[5], provider: AGENTS[3], amount: 1_200_000_000, status: "Completed", taskIdx: 10, daysAgo: 8,  completedDaysAgo: 7 },
  { escrow_address: "1012", client: AGENTS[0], provider: AGENTS[7], amount: 350_000_000,   status: "Completed", taskIdx: 11, daysAgo: 6,  completedDaysAgo: 5 },
  { escrow_address: "1013", client: AGENTS[6], provider: AGENTS[4], amount: 2_000_000_000, status: "Completed", taskIdx: 12, daysAgo: 4,  completedDaysAgo: 3 },
  { escrow_address: "1014", client: AGENTS[1], provider: AGENTS[2], amount: 600_000_000,   status: "Completed", taskIdx: 13, daysAgo: 2,  completedDaysAgo: 1 },

  // Active (3)
  { escrow_address: "1015", client: AGENTS[3], provider: AGENTS[5], amount: 1_500_000_000, status: "Active",    taskIdx: 14, daysAgo: 3 },
  { escrow_address: "1016", client: AGENTS[7], provider: AGENTS[0], amount: 250_000_000,   status: "Active",    taskIdx: 15, daysAgo: 1 },
  { escrow_address: "1017", client: AGENTS[4], provider: AGENTS[6], amount: 900_000_000,   status: "Active",    taskIdx: 16, daysAgo: 0 },

  // ProofSubmitted (1)
  { escrow_address: "1018", client: AGENTS[2], provider: AGENTS[1], amount: 400_000_000,   status: "ProofSubmitted", taskIdx: 17, daysAgo: 2 },

  // Disputed (2)
  { escrow_address: "1019", client: AGENTS[5], provider: AGENTS[4], amount: 1_800_000_000, status: "Disputed",  taskIdx: 18, daysAgo: 5 },
  { escrow_address: "1020", client: AGENTS[0], provider: AGENTS[3], amount: 550_000_000,   status: "Disputed",  taskIdx: 19, daysAgo: 3 },
];

// ── Main ──

async function seed() {
  console.log("Running migration first...");
  await migrate();

  // Clean up previous seed data (escrow IDs 1001–1020)
  console.log("\nCleaning previous seed data (escrows 1001–1020)...");
  const seedIds = SEED_ESCROWS.map((e) => e.escrow_address);
  await query(`DELETE FROM proofs WHERE escrow_address = ANY($1)`, [seedIds]);
  await query(`DELETE FROM disputes WHERE escrow_address = ANY($1)`, [seedIds]);
  await query(`DELETE FROM escrows WHERE escrow_address = ANY($1) AND chain = 'base'`, [seedIds]);
  // Clean seed agent_stats (will be re-created below)
  const allAgentAddrs = [...new Set([...SEED_ESCROWS.map((e) => e.client), ...SEED_ESCROWS.map((e) => e.provider)])];
  await query(`DELETE FROM agent_stats WHERE agent_address = ANY($1)`, [allAgentAddrs]);

  console.log(`Seeding ${SEED_ESCROWS.length} Base escrows...`);

  for (const e of SEED_ESCROWS) {
    const task = TASKS[e.taskIdx];
    const taskHash = fakeHash(`task-${e.taskIdx}-${task.desc}`);
    const createdAt = daysAgo(e.daysAgo);
    const deadline = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
    const completedAt = e.completedDaysAgo != null ? daysAgo(e.completedDaysAgo) : null;
    const fakeTx = `0x${fakeHash(`tx-${e.escrow_address}`)}`;

    // Insert task
    await query(
      `INSERT INTO tasks (task_hash, description, criteria, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (task_hash) DO NOTHING`,
      [taskHash, task.desc, JSON.stringify(task.criteria), JSON.stringify({ seed: true })]
    );

    // Insert escrow (skip if already exists)
    const exists = await query(
      `SELECT 1 FROM escrows WHERE escrow_address = $1 AND chain = $2 LIMIT 1`,
      [e.escrow_address, CHAIN]
    );
    if (exists.rows.length === 0) {
      await query(
        `INSERT INTO escrows (
          escrow_address, client_address, provider_address,
          token_mint, amount, status, verification_type,
          task_hash, deadline, grace_period, tx_signature,
          chain, created_at, updated_at, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          e.escrow_address,
          e.client,
          e.provider,
          USDC_BASE,
          e.amount,
          e.status,
          "OnChain",
          taskHash,
          deadline,
          300,
          fakeTx,
          CHAIN,
          createdAt,
          completedAt || createdAt,
          completedAt,
        ]
      );
    }

    console.log(`  ✓ Escrow ${e.escrow_address} — ${e.status} — $${(e.amount / 1_000_000).toLocaleString()} USDC`);
  }

  // Update agent_stats for all unique addresses
  console.log("\nUpdating agent_stats...");
  const allAddresses = new Set([
    ...SEED_ESCROWS.map((e) => e.client),
    ...SEED_ESCROWS.map((e) => e.provider),
  ]);

  for (const addr of allAddresses) {
    const clientEscrows = SEED_ESCROWS.filter((e) => e.client === addr);
    const providerEscrows = SEED_ESCROWS.filter((e) => e.provider === addr);
    const total = clientEscrows.length + providerEscrows.length;
    const completed = [...clientEscrows, ...providerEscrows].filter(
      (e) => e.status === "Completed"
    ).length;
    const disputed = [...clientEscrows, ...providerEscrows].filter(
      (e) => e.status === "Disputed"
    ).length;
    const volume = [...clientEscrows, ...providerEscrows].reduce(
      (sum, e) => sum + e.amount,
      0
    );
    const successRate = total > 0 ? ((completed / total) * 100).toFixed(2) : "0.00";

    await query(
      `INSERT INTO agent_stats (
        agent_address, total_escrows, completed_escrows, disputed_escrows,
        expired_escrows, total_volume, success_rate, avg_completion_time, last_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
      ON CONFLICT (agent_address) DO UPDATE SET
        total_escrows = agent_stats.total_escrows + $2,
        completed_escrows = agent_stats.completed_escrows + $3,
        disputed_escrows = agent_stats.disputed_escrows + $4,
        total_volume = agent_stats.total_volume + $6,
        success_rate = $7,
        last_active = NOW()`,
      [addr, total, completed, disputed, 0, volume, successRate, 1800]
    );

    console.log(`  ✓ Agent ${addr.slice(0, 10)}... — ${total} escrows, $${(volume / 1_000_000).toLocaleString()} volume`);
  }

  // Insert proofs for completed escrows (skip if already exists)
  console.log("\nSeeding proofs for completed escrows...");
  const completedEscrows = SEED_ESCROWS.filter((e) => e.status === "Completed");
  for (const e of completedEscrows) {
    const existing = await query(
      `SELECT 1 FROM proofs WHERE escrow_address = $1 LIMIT 1`,
      [e.escrow_address]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO proofs (escrow_address, proof_type, proof_data, verified)
         VALUES ($1, $2, $3, true)`,
        [e.escrow_address, "OnChain", `0x${fakeHash(`proof-${e.escrow_address}`)}`]
      );
    }
  }

  // Insert disputes for disputed escrows (skip if already exists)
  console.log("Seeding disputes...");
  const disputedEscrows = SEED_ESCROWS.filter((e) => e.status === "Disputed");
  for (const e of disputedEscrows) {
    const existing = await query(
      `SELECT 1 FROM disputes WHERE escrow_address = $1 LIMIT 1`,
      [e.escrow_address]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO disputes (escrow_address, raised_by, reason)
         VALUES ($1, $2, $3)`,
        [e.escrow_address, e.client, "Provider did not meet the agreed criteria within the deadline"]
      );
    }
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`   ${SEED_ESCROWS.length} escrows`);
  console.log(`   ${allAddresses.size} agents`);
  console.log(`   ${completedEscrows.length} proofs`);
  console.log(`   ${disputedEscrows.length} disputes`);
  console.log(`   Total volume: $${(SEED_ESCROWS.reduce((s, e) => s + e.amount, 0) / 1_000_000).toLocaleString()} USDC`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

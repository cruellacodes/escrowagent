# Indexer (Event Indexer + REST API)

The `indexer/` directory contains the **off-chain infrastructure** for EscrowAgent. It listens to blockchain events on Solana and Base, stores them in PostgreSQL, and exposes a REST API for SDKs and the dashboard.

## Overview

The indexer is the bridge between on-chain activity and off-chain queries. It enables:

- **Event tracking**: Real-time monitoring of escrow lifecycle events
- **Data storage**: Structured PostgreSQL database for fast queries
- **REST API**: Query escrows, tasks, proofs, disputes, and analytics
- **Multi-chain**: Supports Solana and Base simultaneously

## Directory Structure

```
indexer/
├── src/
│   ├── index.ts                # Entry point (migrate → listeners → API)
│   ├── api.ts                  # Fastify REST server
│   ├── db.ts                   # Database migrations & operations
│   ├── listener-solana.ts      # Solana event listener
│   ├── listener-base.ts        # Base EVM event listener
│   └── listener.ts             # Legacy (not used)
├── escrowagent-idl.json        # Solana program IDL
├── package.json
├── .env.example
└── tsconfig.json
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│             BLOCKCHAIN EVENTS                     │
├──────────────────────────────────────────────────┤
│  Solana Program              Base Contract       │
│  (Anchor events)             (EVM logs)           │
└──────────┬──────────────────────────┬─────────────┘
           │                          │
     ┌─────▼──────┐          ┌────────▼────────┐
     │  listener-  │          │  listener-base  │
     │  solana.ts  │          │       .ts       │
     └─────┬───────┘          └────────┬────────┘
           │                           │
           └─────────┬─────────────────┘
                     ▼
           ┌─────────────────┐
           │   PostgreSQL    │
           │   (escrows,     │
           │   tasks, etc.)  │
           └─────────┬───────┘
                     ▼
           ┌─────────────────┐
           │  Fastify API    │
           │  (Port 3001)    │
           └─────────┬───────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Dashboard      SDK         CLI
```

## Database Schema

### Tables

#### `escrows`

Primary table for on-chain escrow records.

```sql
CREATE TABLE escrows (
  id SERIAL PRIMARY KEY,
  escrow_address TEXT UNIQUE NOT NULL,  -- PDA (Solana) or ID (Base)
  client_address TEXT NOT NULL,
  provider_address TEXT,
  arbitrator_address TEXT,
  token_mint TEXT NOT NULL,             -- SPL mint or ERC-20 address
  amount NUMERIC NOT NULL,
  protocol_fee_bps INTEGER,
  status TEXT NOT NULL,
  verification_type TEXT,
  task_hash TEXT,
  deadline BIGINT,
  grace_period BIGINT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  tx_signature TEXT,
  chain TEXT NOT NULL                   -- "solana" or "base"
);

CREATE INDEX idx_escrows_client ON escrows(client_address);
CREATE INDEX idx_escrows_provider ON escrows(provider_address);
CREATE INDEX idx_escrows_status ON escrows(status);
CREATE INDEX idx_escrows_chain ON escrows(chain);
```

**Status Values**:
- `AwaitingProvider`
- `Active`
- `ProofSubmitted`
- `Completed`
- `Disputed`
- `Resolved`
- `Expired`
- `Cancelled`

#### `tasks`

Off-chain task metadata (optional, linked by `task_hash`).

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  task_hash TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  criteria JSONB,                       -- Array of success criteria
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `proofs`

Proof submissions from providers.

```sql
CREATE TABLE proofs (
  id SERIAL PRIMARY KEY,
  escrow_address TEXT NOT NULL,
  proof_type TEXT NOT NULL,             -- "TransactionSignature", etc.
  proof_data TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (escrow_address) REFERENCES escrows(escrow_address)
);

CREATE INDEX idx_proofs_escrow ON proofs(escrow_address);
```

#### `disputes`

Dispute records (off-chain tracking).

```sql
CREATE TABLE disputes (
  id SERIAL PRIMARY KEY,
  escrow_address TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  reason TEXT,
  ruling TEXT,                          -- "PayClient", "PayProvider", "Split"
  ruling_details JSONB,
  raised_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  FOREIGN KEY (escrow_address) REFERENCES escrows(escrow_address)
);

CREATE INDEX idx_disputes_escrow ON disputes(escrow_address);
```

#### `agent_stats`

Aggregated statistics per agent.

```sql
CREATE TABLE agent_stats (
  id SERIAL PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  total_escrows INTEGER DEFAULT 0,
  completed_escrows INTEGER DEFAULT 0,
  disputed_escrows INTEGER DEFAULT 0,
  expired_escrows INTEGER DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,
  success_rate NUMERIC DEFAULT 0,
  avg_completion_time BIGINT,           -- Milliseconds
  last_active TIMESTAMP
);
```

#### `protocol_config`

Protocol configuration (not currently populated by event listeners).

```sql
CREATE TABLE protocol_config (
  id SERIAL PRIMARY KEY,
  admin_address TEXT,
  fee_wallet TEXT,
  protocol_fee_bps INTEGER,
  arbitrator_fee_bps INTEGER,
  min_escrow_amount NUMERIC,
  max_escrow_amount NUMERIC,
  paused BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Event Listeners

### Solana Listener (`listener-solana.ts`)

Monitors the Anchor program using `connection.onLogs()`.

**Setup**:
```typescript
import { Connection } from "@solana/web3.js";
import { AnchorProvider, EventParser } from "@coral-xyz/anchor";
import IDL from "../escrowagent-idl.json";

const connection = new Connection(SOLANA_RPC_URL);
const eventParser = new EventParser(PROGRAM_ID, new BorshCoder(IDL));

connection.onLogs(PROGRAM_ID, async (logs) => {
  const events = eventParser.parseLogs(logs.logs);
  for (const event of events) {
    await handleEvent(event);
  }
});
```

**Events Handled**:

| Event | Handler | Action |
|-------|---------|--------|
| `EscrowCreated` | `handleEscrowCreated` | Insert/update escrow, fetch account data for arbitrator/grace |
| `EscrowAccepted` | `handleStatusUpdate` | Update status to `Active` |
| `EscrowProofSubmitted` | `handleStatusUpdate` | Update status to `ProofSubmitted` |
| `EscrowCompleted` | `handleStatusUpdate` | Update status to `Completed`, set `completed_at` |
| `EscrowCancelled` | `handleStatusUpdate` | Update status to `Cancelled` |
| `EscrowExpired` | `handleStatusUpdate` | Update status to `Expired` |
| `DisputeRaised` | `handleStatusUpdate` | Update status to `Disputed` |
| `DisputeResolved` | `handleStatusUpdate` | Update status to `Resolved` |
| `ProtocolInitialized` | N/A | Logged only |
| `ProtocolConfigUpdated` | N/A | Logged only |

**EscrowCreated Handler**:
```typescript
async function handleEscrowCreated(event: any) {
  // Fetch escrow account to get arbitrator, grace_period, etc.
  const escrowAccount = await program.account.escrow.fetch(event.data.escrowAddress);
  
  await upsertEscrow({
    escrow_address: event.data.escrowAddress.toBase58(),
    client_address: event.data.client.toBase58(),
    provider_address: event.data.provider.toBase58(),
    arbitrator_address: escrowAccount.arbitrator?.toBase58(),
    token_mint: event.data.tokenMint.toBase58(),
    amount: event.data.amount.toString(),
    protocol_fee_bps: escrowAccount.protocolFeeBps,
    status: "AwaitingProvider",
    verification_type: event.data.verificationType,
    task_hash: Buffer.from(event.data.taskHash).toString("hex"),
    deadline: event.data.deadline.toNumber(),
    grace_period: escrowAccount.gracePeriod?.toNumber(),
    tx_signature: event.signature,
    chain: "solana",
  });
}
```

### Base Listener (`listener-base.ts`)

Monitors the Solidity contract using viem's `watchContractEvent`.

**Setup**:
```typescript
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

const client = createPublicClient({
  chain: BASE_CHAIN_ID === 8453 ? base : baseSepolia,
  transport: http(BASE_RPC_URL),
});

const unwatch = client.watchContractEvent({
  address: BASE_CONTRACT_ADDRESS,
  abi: ESCROW_AGENT_ABI,
  onLogs: async (logs) => {
    for (const log of logs) {
      await handleLog(log);
    }
  },
});
```

**Events Handled**:

Same events as Solana, but decoded from EVM logs:

```typescript
switch (log.eventName) {
  case "EscrowCreated":
    await handleEscrowCreated(log.args);
    break;
  case "EscrowAccepted":
    await updateEscrowStatus(log.args.escrowId, "Active");
    break;
  // ... etc
}
```

**EscrowCreated Handler**:
```typescript
async function handleEscrowCreated(args: any) {
  await upsertEscrow({
    escrow_address: args.escrowId.toString(),  // Numeric ID
    client_address: args.client,
    provider_address: args.provider,
    token_mint: args.tokenMint,
    amount: args.amount.toString(),
    status: "AwaitingProvider",
    task_hash: args.taskHash,
    deadline: args.deadline,
    chain: "base",
  });
}
```

**Verification Type Mapping**:
```typescript
const VERIFICATION_TYPES = [
  "OnChain",           // 0
  "OracleCallback",    // 1
  "MultiSigConfirm",   // 2
  "AutoRelease"        // 3
];
```

## REST API

### Server Setup

**Framework**: Fastify (fast, low overhead)

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: CORS_ORIGIN || "*",
});

await fastify.listen({ port: PORT, host: HOST });
```

### Endpoints

#### `GET /health`

Health check.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-13T12:00:00.000Z"
}
```

#### `GET /config`

Protocol configuration.

**Response**:
```json
{
  "admin_address": "0x...",
  "fee_wallet": "0x...",
  "protocol_fee_bps": 50,
  "arbitrator_fee_bps": 100,
  "min_escrow_amount": "1000",
  "paused": false
}
```

#### `GET /stats`

Protocol-wide statistics.

**Response**:
```json
{
  "totalEscrows": 1234,
  "activeEscrows": 56,
  "completedEscrows": 1100,
  "totalVolume": "5000000000",
  "successRate": 89.2
}
```

#### `GET /escrows`

List escrows with optional filters.

**Query Params**:
- `status`: Filter by status (e.g. `Active`)
- `client`: Filter by client address
- `provider`: Filter by provider address
- `chain`: Filter by chain (`solana` or `base`)
- `limit`: Max results (default: 50)
- `offset`: Pagination offset

**Response**:
```json
[
  {
    "escrow_address": "ABC123...",
    "client_address": "0x...",
    "provider_address": "0x...",
    "amount": "50000000",
    "token_mint": "0x833...",
    "status": "Active",
    "deadline": 1739462400,
    "created_at": "2026-02-13T10:00:00.000Z",
    "chain": "base"
  }
]
```

#### `GET /escrows/:address`

Get single escrow with task and proofs.

**Response**:
```json
{
  "escrow": {
    "escrow_address": "ABC123...",
    "client_address": "0x...",
    "provider_address": "0x...",
    "amount": "50000000",
    "status": "ProofSubmitted",
    "deadline": 1739462400,
    "task_hash": "abc123...",
    "chain": "solana"
  },
  "task": {
    "description": "Swap 10 USDC to SOL",
    "criteria": [
      {
        "type": "TransactionExecuted",
        "description": "Swap confirmed on-chain"
      }
    ]
  },
  "proofs": [
    {
      "proof_type": "TransactionSignature",
      "proof_data": "5xY...",
      "submitted_at": "2026-02-13T11:00:00.000Z",
      "verified": false
    }
  ]
}
```

#### `POST /escrows/:address/proof`

Submit proof (off-chain).

**Request Body**:
```json
{
  "proof_type": "TransactionSignature",
  "proof_data": "5xY..."
}
```

**Response**:
```json
{
  "success": true,
  "proof_id": 42
}
```

#### `POST /escrows/:address/dispute`

Raise dispute (off-chain).

**Request Body**:
```json
{
  "raised_by": "0x...",
  "reason": "Provider did not complete task"
}
```

**Response**:
```json
{
  "success": true,
  "dispute_id": 5
}
```

#### `GET /agents/:address/stats`

Agent statistics.

**Response**:
```json
{
  "address": "0x...",
  "total_escrows": 25,
  "completed_escrows": 20,
  "disputed_escrows": 1,
  "expired_escrows": 2,
  "total_volume": "500000000",
  "success_rate": 80.0,
  "avg_completion_time": 3600000,
  "last_active": "2026-02-13T11:30:00.000Z"
}
```

#### `GET /agents/:address/escrows`

Agent escrow history (as client or provider).

**Response**:
```json
[
  {
    "escrow_address": "ABC123...",
    "role": "client",
    "amount": "50000000",
    "status": "Completed",
    "created_at": "2026-02-10T10:00:00.000Z"
  }
]
```

#### `GET /analytics`

Protocol analytics.

**Response**:
```json
{
  "chainBreakdown": [
    { "chain": "solana", "escrowCount": 800, "volume": "3000000000" },
    { "chain": "base", "escrowCount": 400, "volume": "2000000000" }
  ],
  "weeklyTrends": [
    { "week": "2026-W06", "count": 50 },
    { "week": "2026-W07", "count": 75 }
  ],
  "topAgents": [
    { "address": "0x...", "volume": "500000000", "escrowCount": 25 }
  ],
  "performance": {
    "successRate": 89.2,
    "disputeRate": 2.3,
    "avgCompletionTime": 3600000
  },
  "dailyVolume": [
    { "date": "2026-02-12", "volume": "100000000", "count": 10 }
  ]
}
```

#### `POST /tasks`

Create off-chain task.

**Request Body**:
```json
{
  "task_hash": "abc123...",
  "description": "Swap 10 USDC to SOL",
  "criteria": [
    { "type": "TransactionExecuted", "description": "..." }
  ]
}
```

#### `GET /tasks/:hash`

Get task by hash.

**Response**:
```json
{
  "task_hash": "abc123...",
  "description": "Swap 10 USDC to SOL",
  "criteria": [...],
  "created_at": "2026-02-13T10:00:00.000Z"
}
```

## Configuration

### Environment Variables

Create `indexer/.env`:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/escrowagent

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py

# Base (optional, skip if not set)
BASE_RPC_URL=https://sepolia.base.org
BASE_CONTRACT_ADDRESS=0x92508744b0594996ed00ae7ade534248c7b8a5bd
BASE_CHAIN_ID=84532

# API Server
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=*
```

### Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "tsx src/db.ts"
  }
}
```

## Running the Indexer

### Development

```bash
cd indexer

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Run migrations (automatic on start, or manual)
npm run migrate

# Start dev server
npm run dev
```

**Output**:
```
Migrations completed
Solana listener started for program 8rXSN62...
Base listener started for contract 0x9250874...
API server listening on http://0.0.0.0:3001
```

### Production

```bash
# Build TypeScript
npm run build

# Run compiled JS
npm start
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Deploy to Render

1. Create new **Web Service** on Render
2. Connect GitHub repo
3. Set build command: `cd indexer && npm install && npm run build`
4. Set start command: `cd indexer && npm start`
5. Add environment variables from `.env`
6. Deploy

## Database Setup

### PostgreSQL (Supabase)

1. Create project on [Supabase](https://supabase.com/)
2. Get connection string: `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`
3. Set `DATABASE_URL` in `.env`
4. Migrations run automatically on start

### Local PostgreSQL

```bash
# Install PostgreSQL
brew install postgresql@14

# Start service
brew services start postgresql@14

# Create database
createdb escrowagent

# Set DATABASE_URL
DATABASE_URL=postgresql://localhost:5432/escrowagent
```

## Performance

### Indexing Speed

- **Solana**: ~5-10 events/second
- **Base**: ~10-20 events/second
- **Backfill**: Not implemented (starts from current slot/block)

### Database Queries

Most queries use indexes:
- Escrow lookup: `O(1)` via primary key
- Status filter: `O(log n)` via index
- Agent stats: `O(1)` via unique index

### API Response Times

- `/health`: <5ms
- `/stats`: ~50ms (aggregation)
- `/escrows`: ~100ms (100 rows)
- `/analytics`: ~500ms (complex aggregations)

## Monitoring

### Health Checks

```bash
curl http://localhost:3001/health
```

### Logs

Fastify logs all requests:
```
{"level":30,"time":1739462400000,"msg":"incoming request","reqId":"req-1","req":{"method":"GET","url":"/stats"}}
{"level":30,"time":1739462400123,"msg":"request completed","reqId":"req-1","res":{"statusCode":200},"responseTime":123}
```

### Graceful Shutdown

```typescript
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  unwatchSolana();
  unwatchBase();
  await fastify.close();
  process.exit(0);
});
```

## Known Limitations

1. **No backfill** - Only indexes events after start (historical data lost on restart)
2. **No event replay** - If listener crashes, events are missed
3. **Protocol config not updated** - `ProtocolInitialized`/`ConfigUpdated` events are logged but not stored
4. **Single instance** - No horizontal scaling (would duplicate events)

## Future Enhancements

- [ ] Helius webhooks for Solana (more reliable)
- [ ] Event replay/backfill
- [ ] WebSocket support for real-time dashboard
- [ ] Redis caching for frequently accessed data
- [ ] Prometheus metrics
- [ ] Horizontal scaling with distributed locks

## Troubleshooting

### Listener not receiving events

**Check**:
1. RPC URL is correct and accessible
2. Program ID / contract address is correct
3. Network connectivity
4. RPC rate limits

**Debug**:
```typescript
connection.onLogs(PROGRAM_ID, (logs) => {
  console.log("Raw logs:", logs.logs);
}, "confirmed");
```

### Database connection failed

**Check**:
1. `DATABASE_URL` is correct
2. PostgreSQL is running
3. Firewall allows connections
4. Credentials are valid

**Test**:
```bash
psql $DATABASE_URL
```

### API returning stale data

**Check**:
1. Listeners are running
2. Database is being updated
3. API is querying correct table

**Verify**:
```sql
SELECT * FROM escrows ORDER BY created_at DESC LIMIT 10;
```

## Next Steps

- Read [Dashboard Guide](./DASHBOARD.md) to consume the API
- Check [SDK Guide](./SDK.md) for programmatic access
- See [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md) for production setup

## Resources

- [Fastify Documentation](https://www.fastify.io/)
- [Anchor Events](https://www.anchor-lang.com/docs/events)
- [viem Documentation](https://viem.sh/)
- [PostgreSQL Tutorial](https://www.postgresqltutorial.com/)

# AgentVault

**Trust & settlement layer for autonomous agent-to-agent transactions on Solana.**

AgentVault enables AI agents to escrow funds, define success criteria, and auto-settle based on verifiable outcomes — no trust required.

---

## Architecture

```
Agent Ecosystem        →  AgentVault SDK (TS/Python)
                              ↓
Solana Blockchain      →  AgentVault Program (Anchor/Rust)
                              ↓
Off-Chain              →  Indexer + REST API + Dashboard
```

**Core components:**

| Component | Path | Description |
|-----------|------|-------------|
| Solana Program | `programs/agentvault/` | Anchor smart contract — escrow lifecycle, verification, disputes |
| TypeScript SDK | `sdk/typescript/` | `@agentvault/sdk` — agent-facing client library |
| Python SDK | `sdk/python/` | `agentvault-sdk` — Python client for agent frameworks |
| Indexer + API | `indexer/` | Event listener + Fastify REST API + PostgreSQL |
| Dashboard | `dashboard/` | Next.js web UI for monitoring escrows and agents |
| Tests | `tests/` | Anchor integration tests (Mocha/Chai) |

## Quick Start

### Prerequisites

```bash
# Rust + Solana + Anchor
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1 && avm use 0.30.1

# Node.js (v20+)
# https://nodejs.org/
```

### Build & Test

```bash
# Clone and install
cd agentvault
npm install

# Build the Solana program
anchor build

# Run tests on localnet
anchor test

# Deploy to devnet
solana config set --url devnet
solana airdrop 5
anchor deploy
```

### Run the Indexer

```bash
cd indexer
cp .env.example .env
# Edit .env with your DB credentials and RPC URL
npm install
npm run dev
```

### Run the Dashboard

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

## SDK Usage

### TypeScript

```typescript
import { AgentVault, USDC_MINT } from "@agentvault/sdk";
import { Connection, Keypair } from "@solana/web3.js";

const vault = new AgentVault({
  connection: new Connection("https://api.mainnet-beta.solana.com"),
  wallet: agentKeypair,
});

// Create escrow (Agent A)
const escrow = await vault.createEscrow({
  provider: "AgentBpubkey...",
  amount: 50_000_000,              // 50 USDC
  tokenMint: USDC_MINT,
  deadline: Date.now() + 600_000,  // 10 min
  task: {
    description: "Swap 10 USDC to SOL on Jupiter, best price",
    criteria: [
      { type: "TransactionExecuted", description: "Swap tx confirmed" },
      { type: "PriceThreshold", description: "Within 1% of market", targetValue: 100 },
    ],
  },
  verification: "OnChain",
});

// Accept + work + prove (Agent B)
await vault.acceptEscrow(escrow.escrowAddress);
await vault.submitProof(escrow.escrowAddress, {
  type: "TransactionSignature",
  data: swapTxSignature,
});
```

### Python

```python
from agentvault import AgentVault

vault = AgentVault(
    rpc_url="https://api.mainnet-beta.solana.com",
    keypair=agent_keypair,
)

escrow = await vault.create_escrow(
    provider="AgentBpubkey...",
    amount=50_000_000,
    token_mint=USDC_MINT,
    deadline_seconds=600,
    task={
        "description": "Buy cheapest headphones under $50",
        "criteria": [{"type": "TransactionExecuted", "description": "Purchase confirmed"}],
    },
)
```

## Escrow Lifecycle

```
CREATE → AwaitingProvider → [accept] → Active → [submit_proof] → ProofSubmitted
                   ↓                      ↓                          ↓
               [cancel]              [dispute]                  [confirm/verify]
                   ↓                      ↓                          ↓
              Cancelled               Disputed → [resolve] →     Completed
                                                     ↓
                                                  Resolved

                   * Any Active/ProofSubmitted → [expire after deadline+grace] → Expired
```

## Fee Structure

| Event | Fee |
|-------|-----|
| Successful completion | 0.5% protocol fee |
| Dispute resolution | 0.5% protocol + 1.0% arbitrator |
| Cancellation (before accept) | 0% — full refund |
| Expiry (deadline passed) | 0% — full refund |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/escrows` | List escrows (filterable by status, client, provider) |
| GET | `/escrows/:address` | Escrow detail with task + proofs |
| GET | `/escrows/:address/proof` | Proof submissions |
| GET | `/escrows/:address/dispute` | Dispute records |
| GET | `/agents/:address/stats` | Agent reputation stats |
| GET | `/agents/:address/escrows` | All escrows for an agent |
| POST | `/tasks` | Store task description off-chain |
| GET | `/tasks/:hash` | Retrieve task description |
| GET | `/stats` | Protocol-wide statistics |

## Security

- All funds held in PDA vaults — no admin can access them
- Deadline enforcement via Solana's Clock sysvar
- Reentrancy protection via Anchor's built-in checks
- Maximum escrow size limits
- Upgrade authority should be behind a multisig

## Roadmap

- **Phase 1 (MVP):** Core escrow + OnChain/MultiSig verification + TS SDK + devnet
- **Phase 2 (Beta):** Disputes + Oracle verification + Python SDK + Dashboard + mainnet
- **Phase 3 (Growth):** Multi-token + escrow templates + batch escrows + decentralized oracles
- **Phase 4 (Platform):** Agent Router + streaming payments + cross-chain + governance

## License

MIT

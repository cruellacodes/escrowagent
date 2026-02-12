# AgentVault

**Trustless escrow for autonomous agent-to-agent transactions on Solana.**

Agents escrow funds, define success criteria, and auto-settle based on verifiable outcomes — no trust required.

```bash
$ npx agentvault status

  ● Program:    8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py
  ● Status:     DEPLOYED
  ● Network:    Devnet
  ● Protocol:   INITIALIZED
```

---

## How It Works

Agent A locks funds in an on-chain vault. Agent B does the work. Proof is verified. Funds release automatically. If something goes wrong, an arbitrator settles it.

```
Agent A (Client)                    Agent B (Provider)
     │                                    │
     │  vault.createEscrow(...)           │
     │───────────► Solana ◄───────────────│  vault.acceptEscrow(...)
     │                                    │
     │                                    │  ... does the work ...
     │                                    │
     │                                    │  vault.submitProof(...)
     │  vault.confirmCompletion()         │
     │───────────► Solana                 │  ← funds released
     │                                    │
     └──────────── Dashboard ─────────────┘  (humans monitor)
```

No human in the loop. Funds cannot move until program conditions are met.

---

## Quick Start

```bash
# Add AgentVault to your agent project
$ npx agentvault init

# Check protocol status
$ npx agentvault status

# Start MCP server for Claude Desktop
$ npx agentvault mcp
```

### Install the SDK

```bash
npm install @agentvault/sdk
```

### Create Your First Escrow

```typescript
import { AgentVault, USDC_DEVNET_MINT } from "@agentvault/sdk";
import { Connection, Keypair } from "@solana/web3.js";

const vault = new AgentVault({
  connection: new Connection("https://api.devnet.solana.com"),
  wallet: agentKeypair,
});

// Agent A creates an escrow
const escrow = await vault.createEscrow({
  provider: "AgentBpubkey...",
  amount: 50_000_000,             // 50 USDC
  tokenMint: USDC_DEVNET_MINT,
  deadline: Date.now() + 600_000, // 10 min
  task: {
    description: "Swap 10 USDC to SOL on Jupiter at best price",
    criteria: [{ type: "TransactionExecuted", description: "Swap tx confirmed" }],
  },
  verification: "OnChain",
});

// Agent B accepts, works, and proves
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
    rpc_url="https://api.devnet.solana.com",
    keypair=agent_keypair,
)

escrow = await vault.create_escrow(
    provider="AgentBpubkey...",
    amount=50_000_000,
    token_mint=USDC_MINT,
    deadline_seconds=600,
    task={"description": "Swap USDC to SOL", "criteria": [...]},
)
```

---

## AI Agent Tools

AgentVault isn't just an SDK — it's a set of **tools that AI agents can autonomously decide to use.**

### LangChain

```bash
npm install @agentvault/agent-tools @langchain/core
```

```typescript
import { createLangChainTools } from "@agentvault/agent-tools";

const tools = createLangChainTools(vault);
const agent = createReactAgent({ llm, tools });
// Agent now has 9 escrow tools it can use autonomously
```

### Vercel AI SDK

```typescript
import { createVercelAITools } from "@agentvault/agent-tools";

const tools = createVercelAITools(vault);
const { text } = await generateText({ model, tools, prompt });
```

### Claude / MCP

```bash
$ npx agentvault mcp
```

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "npx",
      "args": ["agentvault", "mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "AGENT_PRIVATE_KEY": "[your,keypair,bytes]"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock funds for a task with deadline + success criteria |
| `accept_escrow` | Accept a pending task as the provider |
| `submit_proof` | Submit proof of completion |
| `confirm_completion` | Confirm and release funds to provider |
| `cancel_escrow` | Cancel before provider accepts (full refund) |
| `raise_dispute` | Freeze funds and escalate to arbitrator |
| `get_escrow` | Look up escrow details |
| `list_escrows` | Browse/filter available escrows |
| `get_agent_stats` | Check an agent's reputation and track record |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   AGENT ECOSYSTEM                    │
│                                                      │
│   Agent A ──┐        ┌── Agent B                     │
│             ├── SDK ──┤                               │
│   Agent C ──┘        └── Agent D                     │
│                                                      │
│   AI Tools: LangChain │ Vercel AI │ MCP (Claude)     │
└──────────────────────┬──────────────────────────────┘
                       │
       ────────────────┼──────────────
       SOLANA          │
       ────────────────┼──────────────
                       │
           ┌───────────▼───────────┐
           │   AgentVault Program  │
           │                       │
           │   • Escrow Manager    │
           │   • Verification      │
           │   • Dispute System    │
           │   • Protocol Config   │
           │   • Fee Collector     │
           └───────────┬───────────┘
                       │
           ┌───────────▼───────────┐
           │    Off-Chain Layer    │
           │                       │
           │   • Indexer (events)  │
           │   • REST API          │
           │   • Dashboard (UI)    │
           └───────────────────────┘
```

| Component | Path | Description |
|-----------|------|-------------|
| Solana Program | `programs/agentvault/` | Anchor smart contract — 10 instructions, full escrow lifecycle |
| TypeScript SDK | `sdk/typescript/` | `@agentvault/sdk` — agent-facing client library |
| Python SDK | `sdk/python/` | `agentvault-sdk` — Python client with anchorpy |
| Agent Tools | `sdk/agent-tools/` | LangChain, Vercel AI SDK, and MCP adapters |
| CLI | `sdk/cli/` | `npx agentvault` — init, mcp, status |
| Indexer + API | `indexer/` | Event listener + Fastify REST API + PostgreSQL |
| Dashboard | `dashboard/` | Next.js 15 + Tailwind CSS 4 monitoring UI |
| Tests | `tests/` | 9 passing integration tests |

---

## Escrow Lifecycle

```
CREATE → AwaitingProvider
  ├── [cancel]  → Cancelled (full refund)
  ├── [timeout] → Expired   (full refund)
  └── [accept]  → Active
                    ├── [dispute] → Disputed → [resolve] → Resolved
                    ├── [timeout] → Expired  (full refund)
                    └── [submit_proof] → ProofSubmitted
                                          ├── [confirm/verify] → Completed ✓
                                          ├── [dispute]        → Disputed
                                          └── [timeout]        → Expired
```

## Fee Structure

| Event | Protocol Fee | Arbitrator Fee | Refund |
|-------|-------------|----------------|--------|
| Successful completion | 0.5% | — | Provider gets 99.5% |
| Dispute resolved | 0.5% | 1.0% | Per ruling |
| Cancellation | 0% | — | 100% refund |
| Expiry | 0% | — | 100% refund |

## Protocol Config

The protocol is governed by an on-chain `ProtocolConfig` PDA:

| Field | Description |
|-------|-------------|
| `admin` | Only key that can update config |
| `fee_wallet` | Token account receiving protocol fees |
| `protocol_fee_bps` | Fee rate (50 = 0.5%) |
| `arbitrator_fee_bps` | Dispute fee (100 = 1.0%) |
| `min/max_escrow_amount` | Anti-spam limits |
| `paused` | Emergency stop switch |

Admin can be transferred to a multisig for decentralized governance.

---

## Development

### Prerequisites

- Rust, Solana CLI, Anchor CLI 0.32.1, Node.js 20+

### Build & Test

```bash
npm install
anchor build
anchor test    # 9 passing tests
```

### Deploy

```bash
./scripts/deploy.sh --network devnet
npx tsx scripts/initialize_protocol.ts <fee-wallet-address>
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full guide.

### Run Locally

```bash
# Terminal 1: Indexer
cd indexer && cp .env.example .env && npm install && npm run dev

# Terminal 2: Dashboard
cd dashboard && npm install && npm run dev
# Open http://localhost:3000
```

---

## Deployed

| | |
|---|---|
| **Program ID** | `8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py` |
| **Network** | Solana Devnet |
| **npm** | [`agentvault`](https://www.npmjs.com/package/agentvault) |
| **GitHub** | [`cruellacodes/agentvault`](https://github.com/cruellacodes/agentvault) |

---

## Roadmap

- **Phase 1 (now):** Core escrow, MultiSig + OnChain verification, TS/Python SDKs, AI agent tools, devnet
- **Phase 2:** Oracle verification, decentralized arbitrator pool, multi-token support, mainnet
- **Phase 3:** Escrow templates, batch escrows, agent discovery marketplace
- **Phase 4:** Agent Router, streaming payments, cross-chain, governance

## License

MIT

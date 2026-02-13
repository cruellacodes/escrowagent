# EscrowAgent

**Trustless escrow for autonomous agent-to-agent transactions on Solana.**

Agents escrow funds, define success criteria, and auto-settle based on verifiable outcomes — no trust required.

```bash
$ npx escrowagent status

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
# Add EscrowAgent to your agent project
$ npx escrowagent init

# Check protocol status
$ npx escrowagent status

# Start MCP server for Claude Desktop
$ npx escrowagent mcp
```

### Install the SDK

```bash
npm install @escrowagent/sdk
```

### Create Your First Escrow

```typescript
import { EscrowAgent, USDC_DEVNET_MINT } from "@escrowagent/sdk";
import { Connection, Keypair } from "@solana/web3.js";

const vault = new EscrowAgent({
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
from escrowagent import EscrowAgent

vault = EscrowAgent(
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

EscrowAgent isn't just an SDK — it's a set of **tools that AI agents can autonomously decide to use.**

### LangChain

```bash
npm install @escrowagent/agent-tools @langchain/core
```

```typescript
import { createLangChainTools } from "@escrowagent/agent-tools";

const tools = createLangChainTools(vault);
const agent = createReactAgent({ llm, tools });
// Agent now has 9 escrow tools it can use autonomously
```

### Vercel AI SDK

```typescript
import { createVercelAITools } from "@escrowagent/agent-tools";

const tools = createVercelAITools(vault);
const { text } = await generateText({ model, tools, prompt });
```

### Claude / MCP

```bash
$ npx escrowagent mcp
```

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "escrowagent": {
      "command": "npx",
      "args": ["escrowagent", "mcp"],
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
           │   EscrowAgent Program  │
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
| Solana Program | `programs/escrowagent/` | Anchor smart contract — 10 instructions, full escrow lifecycle |
| TypeScript SDK | `sdk/typescript/` | `@escrowagent/sdk` — agent-facing client library |
| Python SDK | `sdk/python/` | `escrowagent-sdk` — Python client with anchorpy |
| Agent Tools | `sdk/agent-tools/` | LangChain, Vercel AI SDK, and MCP adapters |
| CLI | `sdk/cli/` | `npx escrowagent` — init, mcp, status |
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
| **npm** | [`escrowagent`](https://www.npmjs.com/package/escrowagent) |
| **GitHub** | [`cruellacodes/escrowagent`](https://github.com/cruellacodes/escrowagent) |

---

## Roadmap

- **Phase 1 (now):** Core escrow, MultiSig + OnChain verification, TS/Python SDKs, AI agent tools, devnet
- **Phase 2:** Oracle verification, decentralized arbitrator pool, multi-token support, **Token-2022 (SPL Token Extensions)** — requires migrating `Account<'info, TokenAccount>` / `Account<'info, Mint>` to `InterfaceAccount` and `Program<'info, Token>` to `Interface<'info, TokenInterface>`, mainnet
- **Phase 3:** Escrow templates, batch escrows, agent discovery marketplace
- **Phase 4:** Agent Router, streaming payments, cross-chain, governance

## License

MIT

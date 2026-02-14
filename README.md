# EscrowAgent

**Trustless escrow for autonomous agent-to-agent transactions on Solana and Base.**

Agents escrow funds, define success criteria, and auto-settle based on verifiable outcomes — no trust required. Works on Solana (SPL tokens) and Base (ERC-20 tokens).

```bash
# Scaffold escrow skills into your agent
$ npx escrowagent init

# Or start the MCP server for Claude / Cursor
$ npx escrowagent mcp

# Browse all integrations
$ npx escrowagent skills
```

---

## How It Works

Agent A locks funds in an on-chain vault. Agent B does the work. Proof is verified. Funds release automatically. If something goes wrong, an arbitrator settles it.

```
Agent A (Client)                    Agent B (Provider)
     │                                    │
     │  vault.createEscrow(...)           │
     │───────────► Chain ◄────────────────│  vault.acceptEscrow(...)
     │          (Solana or Base)          │
     │                                    │  ... does the work ...
     │                                    │
     │                                    │  vault.submitProof(...)
     │  vault.confirmCompletion()         │
     │───────────► Chain                  │  ← funds released
     │                                    │
     └──────────── Dashboard ─────────────┘  (humans monitor)
```

No human in the loop. Funds cannot move until program conditions are met.

---

## Supported Chains

| Chain | Contract | Token Standard | Status |
|-------|----------|---------------|--------|
| **Solana** | Anchor program (`8rXSN62...`) | SPL Token | Live on Devnet |
| **Base** | Solidity contract (Foundry) | ERC-20 | Ready to deploy |

Both chains share the same escrow lifecycle, fee structure, and SDK interface. Agents don't need to know which chain they're on — the SDK handles it.

---

## Quick Start

```bash
# Add escrow skills to your agent project
$ npx escrowagent init

# Start MCP server for Claude Desktop / Cursor
$ npx escrowagent mcp

# Browse all integrations (LangChain, Vercel AI, MCP, Python)
$ npx escrowagent skills

# Initialize for Base chain specifically
$ npx escrowagent init --chain base

# Check protocol status
$ npx escrowagent status
```

### Install the SDK

```bash
npm install escrowagent-sdk
```

### Create Your First Escrow (Solana)

```typescript
import { AgentVault, USDC_DEVNET_MINT } from "escrowagent-sdk";
import { Connection, Keypair } from "@solana/web3.js";

const vault = new AgentVault({
  chain: "solana",
  connection: new Connection("https://api.devnet.solana.com"),
  wallet: agentKeypair,
});

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

await vault.acceptEscrow(escrow.escrowAddress);
await vault.submitProof(escrow.escrowAddress, {
  type: "TransactionSignature",
  data: swapTxSignature,
});
```

### Create Your First Escrow (Base)

```typescript
import { AgentVault, USDC_BASE } from "escrowagent-sdk";

const vault = new AgentVault({
  chain: "base",
  privateKey: process.env.PRIVATE_KEY,      // 0x...
  contractAddress: process.env.CONTRACT_ADDR, // 0x...
  rpcUrl: "https://mainnet.base.org",
  chainId: 8453,
});

// Same API as Solana — zero code changes needed
const escrow = await vault.createEscrow({
  provider: "0xProviderAddress...",
  amount: 50_000_000,
  tokenMint: USDC_BASE,                       // USDC on Base
  deadline: Date.now() + 600_000,
  task: {
    description: "Execute a swap on Uniswap",
    criteria: [{ type: "TransactionExecuted", description: "Swap tx confirmed" }],
  },
  verification: "MultiSigConfirm",
});
```

### Python

```python
from escrowagent import AgentVault

# Solana
vault = AgentVault(chain="solana", rpc_url="https://api.devnet.solana.com", keypair=kp)

# Base
vault = AgentVault(chain="base", rpc_url="https://mainnet.base.org",
                   private_key="0x...", contract_address="0x...")

escrow = await vault.create_escrow(params)
```

```bash
# Install with Base support
pip install escrowagent-sdk[base]
```

---

## AI Agent Tools

EscrowAgent isn't just an SDK — it's a set of **tools that AI agents can autonomously decide to use.** Works identically on Solana and Base.

### LangChain

```bash
npm install escrowagent-agent-tools @langchain/core
```

```typescript
import { createLangChainTools } from "escrowagent-agent-tools";

const tools = createLangChainTools(vault);
const agent = createReactAgent({ llm, tools });
// Agent now has 9 escrow tools it can use autonomously
```

### Vercel AI SDK

```typescript
import { createVercelAITools } from "escrowagent-agent-tools";

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

## AI Arbitrator

EscrowAgent includes a built-in **AI-powered arbitrator agent** that automatically resolves disputes using Claude. No human bottleneck.

```
1. Client raises a dispute
2. AI Arbitrator gathers evidence (task, proofs, dispute reason)
3. Claude analyzes and issues a ruling
4. Ruling is submitted on-chain automatically
5. Funds are distributed per the ruling
```

**Default Arbitrator Addresses** (set these when creating escrows):

| Chain | Address |
|-------|---------|
| Base | `0xacB84e5fB127E9B411e8E4Aeb5D59EaE1BF5592e` |
| Solana | `C8xn3TXJXxaKijq3AMMY1k1Su3qdA4cG9z3AMBjfRnfr` |

```typescript
import { DEFAULT_ARBITRATOR_BASE } from "escrowagent-sdk";

const escrow = await vault.createEscrow({
  provider: "0x...",
  arbitrator: DEFAULT_ARBITRATOR_BASE, // AI-powered dispute resolution
  amount: 50_000_000,
  // ...
});
```

**How the AI decides:**
- Reviews the task description and success criteria
- Checks all proof submissions from the provider
- Reads the dispute reason
- Rules `PayProvider` if criteria were met, `PayClient` if not, or `Split` for partial completion
- Only auto-submits if confidence is above 70% — low-confidence cases are flagged for manual review
- Full reasoning and evidence stored on-chain for auditability

The arbitrator is optional — users can set any address (or none) as the arbitrator.

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
       ┌───────────────┼───────────────┐
       │               │               │
   SOLANA          SHARED          BASE
       │               │               │
   ┌───▼───┐    ┌──────▼──────┐   ┌───▼───┐
   │Anchor │    │ TypeScript  │   │Solidity│
   │Program│    │ SDK (viem + │   │Contract│
   │(Rust) │    │   anchor)   │   │(EVM)  │
   └───┬───┘    └──────┬──────┘   └───┬───┘
       │               │               │
       └───────────────┼───────────────┘
                       │
           ┌───────────▼───────────┐
           │    Off-Chain Layer    │
           │                       │
           │   • Indexer (events)  │
           │   • REST API          │
           │   • AI Arbitrator     │
           │   • Dashboard (UI)    │
           └───────────────────────┘
```

| Component | Path | Description |
|-----------|------|-------------|
| Solana Program | `programs/escrowagent/` | Anchor smart contract — 10 instructions, full escrow lifecycle |
| Base Contract | `contracts/` | Solidity/Foundry smart contract (UUPS upgradeable) — 53 tests passing |
| TypeScript SDK | `sdk/typescript/` | `escrowagent-sdk` — multi-chain client (Solana + Base via factory) |
| Python SDK | `sdk/python/` | `escrowagent-sdk` — multi-chain Python client |
| Agent Tools | `sdk/agent-tools/` | LangChain, Vercel AI SDK, and MCP adapters |
| CLI | `sdk/cli/` | `npx escrowagent` — init, mcp, skills, status, info |
| AI Arbitrator | `indexer/src/arbitrator/` | Claude-powered dispute resolution agent |
| Indexer + API | `indexer/` | Dual-chain event listener + Fastify REST API + PostgreSQL |
| Dashboard | `dashboard/` | Next.js 15 monitoring UI with analytics, disputes, and chain selector |
| Solana Tests | `tests/` | Anchor integration tests |
| Base Tests | `contracts/test/` | Foundry tests (53 passing) |

---

## Escrow Lifecycle

The same lifecycle applies on both Solana and Base:

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

Both chains share the same configuration structure:

| Field | Solana | Base |
|-------|--------|------|
| Admin | `ProtocolConfig` PDA | `admin` state variable |
| Fee wallet | `fee_authority` | `feeAuthority` |
| Protocol fee | 50 bps (0.5%) | 50 bps (0.5%) |
| Arbitrator fee | 100 bps (1.0%) | 100 bps (1.0%) |
| Pause mechanism | `paused` flag on PDA | OpenZeppelin `Pausable` |
| Token custody | PDA vault account | Contract holds ERC-20 directly |
| Security | Anchor constraints | ReentrancyGuard + SafeERC20 |

---

## Development

### Prerequisites

- **Solana:** Rust, Solana CLI, Anchor CLI 0.32.1, Node.js 20+
- **Base:** Foundry (forge, cast, anvil)

### Build & Test

```bash
# Install dependencies
npm install

# Solana
anchor build
anchor test

# Base
cd contracts
forge build
forge test -vv    # 18 passing tests
```

### Deploy

```bash
# Solana → Devnet
./scripts/deploy.sh --network devnet
npx tsx scripts/initialize_protocol.ts <fee-wallet-address>

# Base → Sepolia (testnet)
cd contracts
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast --verify

# Base → Mainnet
forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full Solana guide and [DEPLOYMENT_BASE.md](./DEPLOYMENT_BASE.md) for Base + infrastructure setup (Supabase, Render, Vercel).

**Base deployment requirements:**
- ETH on Base for gas (bridge via [bridge.base.org](https://bridge.base.org))
- Deployer private key (`DEPLOYER_PRIVATE_KEY` env var)
- Basescan API key for contract verification (`BASESCAN_API_KEY`)

### Run Locally

```bash
# Terminal 1: Indexer (listens to both chains)
cd indexer && cp .env.example .env && npm install && npm run dev

# Terminal 2: Dashboard
cd dashboard && npm install && npm run dev
# Open http://localhost:3000
```

### Environment Variables

```env
# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENT_PRIVATE_KEY=[keypair,bytes]

# Base
BASE_RPC_URL=https://sepolia.base.org
BASE_PRIVATE_KEY=0x...
BASE_CONTRACT_ADDRESS=0x...
BASESCAN_API_KEY=...

# Shared
ESCROWAGENT_INDEXER_URL=http://localhost:3001
```

---

## Deployed

| | |
|---|---|
| **Solana Program** | `8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py` (Devnet) |
| **Base Contract** | `0x92508744B0594996ED00aE7AdE534248C7b8A5bd` ([Sepolia](https://sepolia.basescan.org/address/0x92508744b0594996ed00ae7ade534248c7b8a5bd)) |
| **AI Arbitrator (Base)** | `0xacB84e5fB127E9B411e8E4Aeb5D59EaE1BF5592e` |
| **AI Arbitrator (Solana)** | `C8xn3TXJXxaKijq3AMMY1k1Su3qdA4cG9z3AMBjfRnfr` |
| **Dashboard** | [escrowagent.vercel.app](https://escrowagent.vercel.app) |
| **API** | [escrowagent.onrender.com](https://escrowagent.onrender.com) |
| **npm** | [`escrowagent-sdk`](https://www.npmjs.com/package/escrowagent-sdk) / [`escrowagent`](https://www.npmjs.com/package/escrowagent) / [`escrowagent-agent-tools`](https://www.npmjs.com/package/escrowagent-agent-tools) |
| **GitHub** | [`cruellacodes/escrowagent`](https://github.com/cruellacodes/escrowagent) |

---

## Publishing to npm / PyPI

After making changes, republish the packages:

```bash
# TypeScript SDK (v0.2.0 — adds Base support)
cd sdk/typescript && npm publish

# Agent Tools
cd sdk/agent-tools && npm publish

# CLI
cd sdk/cli && npm run build && npm publish

# Python SDK
cd sdk/python && python -m build && twine upload dist/*
```

---

## Security

Read [SECURITY.md](./SECURITY.md) for the full trust model, admin powers, known limitations, and how to report vulnerabilities.

**Key points:**
- Funds are held by smart contracts, not by any person
- Admin cannot access escrowed funds (without a visible on-chain upgrade)
- Fees are locked per-escrow at creation time
- No external audit has been performed yet — review the code before escrowing significant funds

## License

MIT

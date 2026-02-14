# SDK (Client Libraries & Tools)

The `sdk/` directory contains client libraries and developer tools for interacting with EscrowAgent on Solana and Base.

## Overview

The SDK layer provides a unified API for creating and managing escrows across multiple blockchains, plus integrations with popular AI agent frameworks.

## Directory Structure

```
sdk/
├── typescript/           # Core TypeScript SDK
├── python/              # Python SDK
├── agent-tools/         # AI agent integrations
└── cli/                 # Command-line interface
```

## TypeScript SDK (`escrowagent-sdk`)

**Location**: `sdk/typescript/`  
**Package**: [`escrowagent-sdk`](https://www.npmjs.com/package/escrowagent-sdk)  
**Purpose**: Multi-chain client library for Node.js and browser

### Installation

```bash
npm install escrowagent-sdk@latest
```

### Quick Start

#### Solana

```typescript
import { AgentVault, USDC_DEVNET_MINT } from "escrowagent-sdk";
import { Connection, Keypair } from "@solana/web3.js";

const vault = new AgentVault({
  chain: "solana",
  connection: new Connection("https://api.devnet.solana.com"),
  wallet: Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.KEYPAIR))),
  indexerUrl: "http://localhost:3001",
});

const escrow = await vault.createEscrow({
  provider: "ProviderPubkey...",
  amount: 50_000_000,  // 50 USDC (6 decimals)
  tokenMint: USDC_DEVNET_MINT,
  deadline: Date.now() + 600_000,  // 10 minutes
  task: {
    description: "Swap 10 USDC to SOL on Jupiter",
    criteria: [
      { type: "TransactionExecuted", description: "Swap tx confirmed" }
    ],
  },
  verification: "OnChain",
});

console.log("Escrow created:", escrow.escrowAddress);
```

#### Base

```typescript
import { AgentVault, USDC_BASE } from "escrowagent-sdk";

const vault = new AgentVault({
  chain: "base",
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
  rpcUrl: "https://mainnet.base.org",
  chainId: 8453,
});

const escrow = await vault.createEscrow({
  provider: "0xProviderAddress...",
  amount: 50_000_000,
  tokenMint: USDC_BASE,
  deadline: Date.now() + 600_000,
  task: {
    description: "Execute swap on Uniswap",
    criteria: [
      { type: "TransactionExecuted", description: "Swap confirmed" }
    ],
  },
  verification: "MultiSigConfirm",
});
```

### API Reference

#### AgentVault (Factory)

Multi-chain client factory that returns the appropriate implementation based on config.

**Solana Config**:
```typescript
{
  chain?: "solana";
  connection: Connection;
  wallet: Keypair | Wallet;
  programId?: PublicKey;
  indexerUrl?: string;
}
```

**Base Config**:
```typescript
{
  chain: "base";
  privateKey: string;
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
  indexerUrl?: string;
}
```

#### Methods

**`createEscrow(params)`**

Lock tokens in escrow with task and deadline.

```typescript
interface CreateEscrowParams {
  provider: string;               // Provider address
  amount: number;                 // Amount in token base units
  tokenMint: string;              // Token mint/address
  deadline: number;               // Unix timestamp (ms)
  task: {
    description: string;
    criteria: Array<{
      type: CriterionType;
      description: string;
    }>;
    metadata?: Record<string, any>;
  };
  verification: VerificationType;
  arbitrator?: string;            // Optional arbitrator
  gracePeriod?: number;           // Grace period in seconds
}

interface CreateEscrowResult {
  escrowAddress: string;
  signature: string;
  taskHash: string;
}
```

**`acceptEscrow(escrowAddress)`**

Provider accepts a pending escrow.

```typescript
await vault.acceptEscrow("EscrowAddress...");
```

**`submitProof(escrowAddress, proof)`**

Submit proof of task completion.

```typescript
interface SubmitProofParams {
  type: ProofType;
  data: string;
  metadata?: Record<string, any>;
}

await vault.submitProof("EscrowAddress...", {
  type: "TransactionSignature",
  data: "5xYz...",
});
```

**`confirmCompletion(escrowAddress)`**

Client confirms completion and releases funds.

```typescript
await vault.confirmCompletion("EscrowAddress...");
```

**`cancelEscrow(escrowAddress)`**

Client cancels before provider accepts (full refund).

```typescript
await vault.cancelEscrow("EscrowAddress...");
```

**`raiseDispute(escrowAddress, reason)`**

Raise a dispute (freezes funds).

```typescript
await vault.raiseDispute("EscrowAddress...", {
  reason: "Provider did not complete task"
});
```

**`resolveDispute(escrowAddress, ruling)`**

Arbitrator resolves dispute.

```typescript
await vault.resolveDispute("EscrowAddress...", {
  ruling: "PayClient"  // or "PayProvider" or "Split"
});
```

**`getEscrow(escrowAddress)`**

Fetch escrow details.

```typescript
const escrow = await vault.getEscrow("EscrowAddress...");
console.log(escrow.status, escrow.amount);
```

**`listEscrows(filter?)`**

List escrows with optional filters.

```typescript
const escrows = await vault.listEscrows({
  status: "Active",
  client: "ClientAddress...",
});
```

**`getAgentStats(agentAddress)`**

Get agent reputation stats (requires indexer).

```typescript
const stats = await vault.getAgentStats("AgentAddress...");
console.log(stats.successRate, stats.totalVolume);
```

### Types & Enums

```typescript
enum EscrowStatus {
  AwaitingProvider = "AwaitingProvider",
  Active = "Active",
  ProofSubmitted = "ProofSubmitted",
  Completed = "Completed",
  Disputed = "Disputed",
  Resolved = "Resolved",
  Expired = "Expired",
  Cancelled = "Cancelled",
}

enum VerificationType {
  OnChain = "OnChain",
  OracleCallback = "OracleCallback",
  MultiSigConfirm = "MultiSigConfirm",
  AutoRelease = "AutoRelease",
}

enum ProofType {
  TransactionSignature = "TransactionSignature",
  OracleAttestation = "OracleAttestation",
  SignedConfirmation = "SignedConfirmation",
}

enum CriterionType {
  TransactionExecuted = "TransactionExecuted",
  TokenTransferred = "TokenTransferred",
  PriceThreshold = "PriceThreshold",
  TimeBound = "TimeBound",
  Custom = "Custom",
}

enum DisputeRuling {
  PayClient = "PayClient",
  PayProvider = "PayProvider",
  Split = "Split",
}
```

### Utilities

#### Solana (`utils.ts`)

```typescript
// Constants
export const PROGRAM_ID = new PublicKey("8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const USDC_DEVNET_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

// PDA Derivation
export function deriveEscrowPDA(
  client: PublicKey,
  provider: PublicKey,
  taskHash: Buffer
): [PublicKey, number];

export function deriveVaultPDA(escrowPDA: PublicKey): [PublicKey, number];

// Helpers
export function hashTask(task: Task): Buffer;
export function formatTokenAmount(amount: number, decimals: number): string;
export function parseTokenAmount(amount: string, decimals: number): number;
```

#### Base (`base-utils.ts`)

```typescript
// Constants
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// ABI
export const ESCROW_AGENT_ABI = [/* ... */];

// Helpers
export function hashTaskBase(task: Task): string;
export function verificationTypeToUint8(vtype: VerificationType): number;
export function uint8ToVerificationType(v: number): VerificationType;
```

### Structure

```
sdk/typescript/
├── src/
│   ├── index.ts            # Public exports
│   ├── client.ts           # AgentVault factory
│   ├── solana.ts           # SolanaEscrowClient
│   ├── base.ts             # BaseEscrowClient
│   ├── types.ts            # Shared types & enums
│   ├── utils.ts            # Solana utilities
│   └── base-utils.ts       # Base utilities
├── dist/                   # Compiled output
├── package.json
└── tsconfig.json
```

---

## Python SDK (`escrowagent-sdk`)

**Location**: `sdk/python/`  
**Package**: [`escrowagent-sdk`](https://pypi.org/project/escrowagent-sdk/)  
**Purpose**: Python client for Solana and Base

### Installation

```bash
# Solana only
pip install escrowagent-sdk

# With Base support
pip install escrowagent-sdk[base]
```

### Quick Start

```python
from escrowagent import AgentVault, USDC_DEVNET_MINT
from solana.keypair import Keypair

# Solana
vault = AgentVault(
    chain="solana",
    rpc_url="https://api.devnet.solana.com",
    keypair=Keypair.from_secret_key(bytes(...)),
    indexer_url="http://localhost:3001"
)

# Base
vault = AgentVault(
    chain="base",
    rpc_url="https://mainnet.base.org",
    private_key="0x...",
    contract_address="0x...",
    chain_id=8453
)

# Create escrow
result = await vault.create_escrow(
    provider="ProviderAddress...",
    amount=50_000_000,
    token_mint=USDC_DEVNET_MINT,
    deadline=int(time.time() * 1000) + 600_000,
    task={
        "description": "Swap USDC to SOL",
        "criteria": [
            {"type": "TransactionExecuted", "description": "Swap confirmed"}
        ]
    },
    verification="OnChain"
)
```

### Structure

```
sdk/python/
├── escrowagent/
│   ├── __init__.py
│   ├── client.py           # AgentVault factory
│   ├── solana.py           # Solana client (AnchorPy)
│   ├── base.py             # Base client (web3.py)
│   └── types.py            # Enums, dataclasses
├── pyproject.toml
└── README.md
```

---

## Agent Tools (`escrowagent-agent-tools`)

**Location**: `sdk/agent-tools/`  
**Package**: [`escrowagent-agent-tools`](https://www.npmjs.com/package/escrowagent-agent-tools)  
**Purpose**: AI agent framework integrations

### Installation

```bash
npm install escrowagent-agent-tools@latest escrowagent-sdk@latest
```

### Supported Frameworks

- **LangChain** (via `@langchain/core`)
- **Vercel AI SDK** (via `ai`)
- **MCP** (Model Context Protocol for Claude/Cursor)

### LangChain Integration

```typescript
import { createLangChainTools } from "escrowagent-agent-tools";
import { AgentVault } from "escrowagent-sdk";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const vault = new AgentVault({/* config */});
const tools = createLangChainTools(vault);

const llm = new ChatOpenAI({ model: "gpt-4" });
const agent = createReactAgent({ llm, tools });

const result = await agent.invoke({
  messages: [{ role: "user", content: "Create an escrow for 50 USDC" }]
});
```

### Vercel AI SDK Integration

```typescript
import { createVercelAITools } from "escrowagent-agent-tools";
import { AgentVault } from "escrowagent-sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const vault = new AgentVault({/* config */});
const tools = createVercelAITools(vault);

const { text } = await generateText({
  model: openai("gpt-4"),
  tools,
  prompt: "Create an escrow for Agent B with 50 USDC for a token swap",
});
```

### MCP Server Integration

```typescript
import { createMCPServer } from "escrowagent-agent-tools";
import { AgentVault } from "escrowagent-sdk";

const vault = new AgentVault({/* config */});
const { listen } = createMCPServer(vault);

await listen();  // Starts MCP server on stdio
```

**Claude Desktop Config** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "escrowagent": {
      "command": "npx",
      "args": ["escrowagent", "mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "AGENT_PRIVATE_KEY": "[keypair,bytes]"
      }
    }
  }
}
```

### Available Tools

All frameworks expose the same 9 tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_escrow` | Lock funds for a task | provider, amount, tokenMint, deadline, task, verification |
| `accept_escrow` | Accept a pending escrow | escrowAddress |
| `submit_proof` | Submit proof of completion | escrowAddress, proof |
| `confirm_completion` | Confirm and release funds | escrowAddress |
| `cancel_escrow` | Cancel before acceptance | escrowAddress |
| `raise_dispute` | Freeze and escalate to arbitrator | escrowAddress, reason |
| `get_escrow` | Fetch escrow details | escrowAddress |
| `list_escrows` | Browse/filter escrows | filter (status, client, provider) |
| `get_agent_stats` | Check agent reputation | agentAddress |

### Structure

```
sdk/agent-tools/
├── src/
│   ├── index.ts            # Public exports
│   ├── definitions.ts      # Tool schemas (Zod)
│   ├── executor.ts         # Tool name → SDK method mapping
│   ├── langchain.ts        # LangChain adapter
│   ├── vercel-ai.ts        # Vercel AI adapter
│   ├── mcp.ts              # MCP server
│   └── utils.ts            # zodToJsonSchema
├── examples/
│   ├── langchain-agent.ts
│   ├── vercel-ai-agent.ts
│   └── mcp-server.ts
└── package.json
```

---

## CLI (`escrowagent`)

**Location**: `sdk/cli/`  
**Package**: [`escrowagent`](https://www.npmjs.com/package/escrowagent)  
**Purpose**: Command-line developer tools

### Installation

```bash
npm install -g escrowagent
# or
npx escrowagent@latest <command>
```

### Agent Skills

Install escrow capabilities directly into your AI coding agent:

```bash
npx skills add cruellacodes/escrowagent
```

Works with Cursor, Claude Code, Codex, GitHub Copilot, and [35+ more](https://github.com/vercel-labs/skills).

### Commands

#### `init`

Initialize EscrowAgent in your project.

```bash
# Solana (default)
npx escrowagent@latest init

# Base
npx escrowagent@latest init --chain base
```

**Creates**:
- `.env.example` with required variables
- `escrow-example.ts` with SDK usage
- README snippet

#### `mcp`

Start MCP server for Claude/Cursor.

```bash
npx escrowagent@latest mcp
```

**Environment Variables**:
- `SOLANA_RPC_URL` (for Solana)
- `AGENT_PRIVATE_KEY` (Solana keypair or EVM private key)
- `BASE_RPC_URL`, `BASE_CONTRACT_ADDRESS`, `BASE_CHAIN_ID` (for Base)

#### `status`

Check protocol status.

```bash
npx escrowagent@latest status

# Output:
# ✓ Solana Program: 8rXSN62... (Devnet)
# ✓ Base Contract: 0x9250874... (Sepolia)
# ✓ Indexer: http://localhost:3001 (healthy)
```

#### `info`

Display protocol info.

```bash
npx escrowagent@latest info

# Output:
# Solana:
#   Program ID:  8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py
#   Network:     Devnet
#
# Base (EVM):
#   Chain ID:    8453 (mainnet) / 84532 (sepolia)
#   Explorer:    https://basescan.org
```

#### `help`

Show help.

```bash
npx escrowagent@latest help
```

### Structure

```
sdk/cli/
├── src/
│   └── cli.ts              # Command dispatcher
├── dist/
├── package.json            # "bin": { "escrowagent": "./dist/cli.js" }
└── tsconfig.json
```

---

## Configuration

### Environment Variables

#### TypeScript SDK

```env
# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENT_PRIVATE_KEY=[keypair,bytes]

# Base
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=0x...
BASE_CONTRACT_ADDRESS=0x...
BASE_CHAIN_ID=8453

# Indexer (optional)
ESCROWAGENT_INDEXER_URL=http://localhost:3001
```

#### Python SDK

Same as TypeScript, but use Python conventions:

```python
import os
from solana.keypair import Keypair

rpc_url = os.getenv("SOLANA_RPC_URL")
keypair = Keypair.from_secret_key(bytes(json.loads(os.getenv("AGENT_PRIVATE_KEY"))))
```

---

## Multi-Chain Abstraction

The SDK provides a unified API across both chains:

| Feature | Solana | Base | Abstraction |
|---------|--------|------|-------------|
| **Escrow ID** | Base58 PDA | Numeric ID | String address |
| **Token** | SPL mint | ERC-20 address | `tokenMint` |
| **Wallet** | Keypair | Private key | Auto-detected |
| **Verification** | Same enums | Same enums | Shared types |
| **Status** | Same states | Same states | Shared enum |

**Example**:

```typescript
// Same code works on both chains!
const vault = new AgentVault({ chain: "solana", /* ... */ });
// or
const vault = new AgentVault({ chain: "base", /* ... */ });

// Same API
const escrow = await vault.createEscrow({/* ... */});
await vault.acceptEscrow(escrow.escrowAddress);
await vault.confirmCompletion(escrow.escrowAddress);
```

---

## Testing SDKs

### TypeScript

```bash
cd sdk/typescript
npm test
```

### Python

```bash
cd sdk/python
pytest
```

### Agent Tools

```bash
cd sdk/agent-tools

# Run examples
npx tsx examples/langchain-agent.ts
npx tsx examples/mcp-server.ts
```

---

## Publishing

### TypeScript SDK

```bash
cd sdk/typescript
npm version patch  # or minor/major
npm publish
```

### Python SDK

```bash
cd sdk/python
python -m build
twine upload dist/*
```

### Agent Tools

```bash
cd sdk/agent-tools
npm version patch
npm publish
```

### CLI

```bash
cd sdk/cli
npm run build
npm version patch
npm publish
```

---

## Best Practices

### Error Handling

```typescript
try {
  await vault.createEscrow({/* ... */});
} catch (error) {
  if (error.message.includes("insufficient funds")) {
    // Handle insufficient balance
  } else if (error.message.includes("deadline too far")) {
    // Handle invalid deadline
  } else {
    throw error;
  }
}
```

### Deadline Calculation

```typescript
const TEN_MINUTES = 10 * 60 * 1000;
const deadline = Date.now() + TEN_MINUTES;
```

### Grace Period

```typescript
const gracePeriod = 300;  // 5 minutes in seconds
```

### Task Hash

Task hash is automatically computed from the task object:

```typescript
// Solana
import { hashTask } from "escrowagent-sdk";
const taskHash = hashTask(task);

// Base
import { hashTaskBase } from "escrowagent-sdk";
const taskHash = hashTaskBase(task);
```

---

## Comparison

| Feature | TypeScript SDK | Python SDK | Agent Tools | CLI |
|---------|---------------|------------|-------------|-----|
| **Create escrows** | ✅ | ✅ | ✅ (via AI) | ⚠️ (template) |
| **Query escrows** | ✅ | ✅ | ✅ | ⚠️ (status only) |
| **Multi-chain** | ✅ | ✅ | ✅ | ✅ |
| **Browser** | ✅ | ❌ | ✅ | ❌ |
| **Node.js** | ✅ | ✅ | ✅ | ✅ |
| **AI frameworks** | ❌ | ❌ | ✅ | ❌ |
| **MCP server** | ❌ | ❌ | ✅ | ✅ |

---

## Next Steps

- Read [Contracts Guide](./CONTRACTS.md) to understand Base implementation
- Check [Programs Guide](./PROGRAMS.md) for Solana implementation
- See [Indexer Guide](./INDEXER.md) for API details

## Resources

- [npm: escrowagent-sdk](https://www.npmjs.com/package/escrowagent-sdk)
- [PyPI: escrowagent-sdk](https://pypi.org/project/escrowagent-sdk/)
- [LangChain Docs](https://js.langchain.com/docs/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [MCP Protocol](https://modelcontextprotocol.io/)

# EscrowAgent Project Overview

**A trustless escrow protocol for autonomous agent-to-agent transactions on Solana and Base.**

## What This Project Does

EscrowAgent enables AI agents to safely transact with each other on-chain without requiring trust. Agent A locks funds in an escrow vault, Agent B completes a task, submits proof, and funds are automatically released when verified. If disputes arise, an arbitrator settles them.

The protocol works identically on two blockchains:
- **Solana** (SPL tokens via Anchor program)
- **Base** (ERC-20 tokens via Solidity contract)

## Project Architecture

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
           │   • Dashboard (UI)    │
           └───────────────────────┘
```

## Repository Structure

| Directory | Purpose | Documentation |
|-----------|---------|---------------|
| **programs/** | Solana Anchor program (Rust) | [Programs Guide](./PROGRAMS.md) |
| **contracts/** | Base Solidity contracts (Foundry) | [Contracts Guide](./CONTRACTS.md) |
| **sdk/** | Multi-language SDKs and AI tools | [SDK Guide](./SDK.md) |
| **indexer/** | Event indexer + REST API | [Indexer Guide](./INDEXER.md) |
| **dashboard/** | Next.js monitoring UI | [Dashboard Guide](./DASHBOARD.md) |
| **scripts/** | Deployment & testing scripts | [Scripts Guide](./SCRIPTS.md) |
| **tests/** | Integration tests | [Tests Guide](./TESTS.md) |

## Key Features

### Multi-Chain Support
- Same API works on Solana and Base
- Chain-agnostic SDK (`AgentVault` factory)
- Unified escrow lifecycle across both chains

### Verification Methods
- **OnChain**: Verify transaction signatures
- **MultiSigConfirm**: Client manual confirmation
- **OracleCallback**: External oracle verification
- **AutoRelease**: Time-based automatic release

### Safety Features
- Escrow states prevent double-spending
- Deadline + grace period for automatic expiry
- Dispute resolution with arbitrator
- Fee structure (0.5% protocol fee)

### AI Agent Integration
- LangChain tools
- Vercel AI SDK tools
- MCP server for Claude/Cursor
- 9 autonomous tools (create, accept, submit proof, etc.)

## Quick Navigation

**Getting Started:**
- [Installation & Setup](../README.md#quick-start)
- [Deploy to Solana](../DEPLOYMENT.md)
- [Deploy to Base](../DEPLOYMENT_BASE.md)

**Core Components:**
- [Solana Program (Rust)](./PROGRAMS.md) - Smart contract on Solana
- [Base Contracts (Solidity)](./CONTRACTS.md) - Smart contract on Base
- [SDK Libraries](./SDK.md) - TypeScript, Python, CLI, Agent Tools
- [Indexer & API](./INDEXER.md) - Event tracking and REST API
- [Dashboard](./DASHBOARD.md) - Monitoring UI

**Development:**
- [Scripts](./SCRIPTS.md) - Deployment and testing utilities
- [Tests](./TESTS.md) - Integration test suite

## Technology Stack

| Layer | Solana | Base | Shared |
|-------|--------|------|--------|
| **Smart Contracts** | Anchor 0.32.1 (Rust) | Foundry (Solidity 0.8.24) | — |
| **SDK** | @solana/web3.js, @coral-xyz/anchor | viem | TypeScript 5 |
| **Python SDK** | AnchorPy | web3.py | Python 3.10+ |
| **Indexer** | @solana/web3.js | viem | Fastify, PostgreSQL |
| **Dashboard** | — | — | Next.js 15, React 19, Tailwind 4 |
| **AI Tools** | — | — | LangChain, Vercel AI, MCP |

## Escrow Lifecycle

Both chains follow the same state machine:

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

## Deployed Addresses

| Network | Address | Status |
|---------|---------|--------|
| **Solana Devnet** | `8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py` | Live |
| **Base Mainnet** | Deploy with `forge script` | Ready to deploy |
| **Base Sepolia** | `0x92508744b0594996ed00ae7ade534248c7b8a5bd` | Testnet |

## Development Workflow

### Build Everything
```bash
# Install dependencies
npm install

# Build Solana program
anchor build

# Build Base contracts
cd contracts && forge build

# Build SDKs
cd sdk/typescript && npm run build
cd sdk/agent-tools && npm run build
```

### Test Everything
```bash
# Test Solana
anchor test

# Test Base
cd contracts && forge test -vv

# Test SDK
cd sdk/typescript && npm test
```

### Run Locally
```bash
# Terminal 1: Indexer
cd indexer && cp .env.example .env && npm run dev

# Terminal 2: Dashboard
cd dashboard && npm run dev
```

## Environment Variables

See individual component docs for detailed environment setup:
- [Indexer environment](./INDEXER.md#configuration)
- [Dashboard environment](./DASHBOARD.md#configuration)
- [SDK configuration](./SDK.md#configuration)

## Common Tasks

| Task | Command | Documentation |
|------|---------|---------------|
| Deploy to Solana Devnet | `./scripts/deploy.sh --network devnet` | [DEPLOYMENT.md](../DEPLOYMENT.md) |
| Deploy to Base Sepolia | `cd contracts && forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast` | [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md) |
| Initialize protocol | `npx tsx scripts/initialize_protocol.ts <fee-wallet>` | [Scripts Guide](./SCRIPTS.md) |
| Start MCP server | `npx escrowagent mcp` | [SDK Guide](./SDK.md#cli) |
| Run indexer | `cd indexer && npm run dev` | [Indexer Guide](./INDEXER.md) |
| Run dashboard | `cd dashboard && npm run dev` | [Dashboard Guide](./DASHBOARD.md) |

## Next Steps

1. **Understand the protocol**: Read [Solana Program](./PROGRAMS.md) or [Base Contracts](./CONTRACTS.md)
2. **Use the SDK**: Check [SDK Guide](./SDK.md) for TypeScript/Python examples
3. **Query data**: See [Indexer Guide](./INDEXER.md) for API endpoints
4. **Monitor escrows**: Check [Dashboard Guide](./DASHBOARD.md) for UI features
5. **Deploy your own**: Follow [DEPLOYMENT.md](../DEPLOYMENT.md) or [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md)

## Support & Resources

- **GitHub**: [cruellacodes/escrow-agent](https://github.com/cruellacodes/escrow-agent)
- **npm**: [escrowagent-sdk](https://www.npmjs.com/package/escrowagent-sdk)
- **PyPI**: [escrowagent-sdk](https://pypi.org/project/escrowagent-sdk/)
- **Main README**: [README.md](../README.md)

## License

MIT

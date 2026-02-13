# EscrowAgent Documentation

Comprehensive documentation for the EscrowAgent protocol - a trustless escrow system for autonomous agent-to-agent transactions on Solana and Base.

## 📚 Documentation Index

### Getting Started

**[Project Overview](./PROJECT_OVERVIEW.md)** - Start here for a high-level understanding of the entire project, architecture, and how components fit together.

### Core Components

| Component | Description | Documentation |
|-----------|-------------|---------------|
| **Solana Program** | Anchor smart contract on Solana | [PROGRAMS.md](./PROGRAMS.md) |
| **Base Contracts** | Solidity smart contract on Base | [CONTRACTS.md](./CONTRACTS.md) |
| **SDK** | Multi-language client libraries | [SDK.md](./SDK.md) |
| **Indexer** | Event indexer + REST API | [INDEXER.md](./INDEXER.md) |
| **Dashboard** | Next.js monitoring UI | [DASHBOARD.md](./DASHBOARD.md) |

### Development

| Topic | Documentation |
|-------|---------------|
| **Scripts** | Deployment and testing utilities | [SCRIPTS.md](./SCRIPTS.md) |
| **Tests** | Integration test suite | [TESTS.md](./TESTS.md) |

## 🎯 Quick Navigation

### By Use Case

**I want to...**

- **Understand the project** → [Project Overview](./PROJECT_OVERVIEW.md)
- **Deploy on Solana** → [Programs Guide](./PROGRAMS.md) + [Scripts Guide](./SCRIPTS.md)
- **Deploy on Base** → [Contracts Guide](./CONTRACTS.md)
- **Build a client app** → [SDK Guide](./SDK.md)
- **Query escrow data** → [Indexer Guide](./INDEXER.md)
- **Monitor the protocol** → [Dashboard Guide](./DASHBOARD.md)
- **Run tests** → [Tests Guide](./TESTS.md)

### By Technology

| Technology | Guides |
|------------|--------|
| **Rust/Anchor** | [Programs](./PROGRAMS.md), [Tests](./TESTS.md#solana-tests) |
| **Solidity/Foundry** | [Contracts](./CONTRACTS.md), [Tests](./TESTS.md#base-tests) |
| **TypeScript** | [SDK](./SDK.md), [Indexer](./INDEXER.md), [Dashboard](./DASHBOARD.md) |
| **Python** | [SDK - Python](./SDK.md#python-sdk) |
| **PostgreSQL** | [Indexer - Database](./INDEXER.md#database-schema) |
| **Next.js** | [Dashboard](./DASHBOARD.md) |

## 📖 Component Deep Dives

### [Solana Program (PROGRAMS.md)](./PROGRAMS.md)

Learn about the Anchor program that powers EscrowAgent on Solana:

- **Account model**: Escrow PDAs, vault accounts, protocol config
- **Instructions**: 10 instructions covering the full escrow lifecycle
- **State machine**: Status transitions and validation
- **Events**: On-chain event emissions
- **Security**: PDA ownership, signer checks, integer overflow protection
- **Deployment**: Build, test, and deploy to devnet/mainnet

**Key Topics**:
- PDA derivation
- Token custody via vault accounts
- Dispute resolution
- Grace periods and expiry
- Fee structure

---

### [Base Contracts (CONTRACTS.md)](./CONTRACTS.md)

Explore the Solidity implementation on Base:

- **Contract architecture**: EscrowAgent.sol and IEscrowAgent.sol
- **ERC-20 custody**: SafeERC20 token handling
- **State machine**: Same lifecycle as Solana
- **Deployment**: Foundry scripts for testnet and mainnet
- **Testing**: 18 passing Foundry tests
- **Security**: ReentrancyGuard, Pausable, access control

**Key Topics**:
- Duplicate escrow prevention
- Provider auto-release
- Dispute ruling (PayClient, PayProvider, Split)
- Gas optimization

---

### [SDK (SDK.md)](./SDK.md)

Integrate EscrowAgent into your agent applications:

**TypeScript SDK**:
- Multi-chain `AgentVault` factory
- Same API for Solana and Base
- Full TypeScript types
- Utility functions (PDA derivation, task hashing)

**Python SDK**:
- Mirror of TypeScript functionality
- AnchorPy for Solana
- web3.py for Base

**Agent Tools**:
- LangChain integration
- Vercel AI SDK integration
- MCP server for Claude/Cursor
- 9 autonomous tools

**CLI**:
- `init` - Project scaffolding
- `mcp` - Start MCP server
- `status` - Protocol health check
- `info` - Display contract addresses

---

### [Indexer (INDEXER.md)](./INDEXER.md)

Understand the off-chain infrastructure:

**Event Listeners**:
- Solana: `onLogs` subscription with EventParser
- Base: `watchContractEvent` with viem
- Dual-chain support

**Database Schema**:
- `escrows` - On-chain escrow records
- `tasks` - Off-chain task metadata
- `proofs` - Proof submissions
- `disputes` - Dispute records
- `agent_stats` - Aggregated agent metrics

**REST API**:
- `/stats` - Protocol-wide statistics
- `/escrows` - List and filter escrows
- `/agents/:address/stats` - Agent reputation
- `/analytics` - Charts and trends

**Deployment**:
- Local development
- Production (Render, Railway, etc.)
- Database setup (Supabase, PostgreSQL)

---

### [Dashboard (DASHBOARD.md)](./DASHBOARD.md)

Explore the monitoring interface:

**Pages**:
- Home dashboard with protocol stats
- Escrow list with filtering
- Escrow detail view
- Analytics dashboard
- Agent profiles
- Documentation

**Technology**:
- Next.js 15 (App Router)
- React 19
- Tailwind CSS 4
- Server components + ISR

**Features**:
- Chain selector (Solana/Base)
- Status badges
- Responsive design
- Dark theme

---

### [Scripts (SCRIPTS.md)](./SCRIPTS.md)

Automate deployment and testing:

**Solana**:
- `deploy.sh` - Build and deploy Anchor program
- `initialize_protocol.ts` - Initialize config PDA
- `test_devnet.ts` - End-to-end devnet tests

**Base**:
- `Deploy.s.sol` - Foundry deployment script
- `DeployMockUSDC.s.sol` - Test token deployment

**Utilities**:
- Airdrop scripts
- Config updates
- Account inspection

---

### [Tests (TESTS.md)](./TESTS.md)

Validate the protocol:

**Solana Tests** (Anchor + Mocha):
- 18 tests covering all instructions
- Happy path, error cases, edge cases
- Local validator (automatic)
- ~18 seconds runtime

**Base Tests** (Foundry):
- 18 tests mirroring Solana
- Anvil local EVM
- ~2 seconds runtime
- Coverage reporting

**Test Coverage**:
- ✅ Protocol initialization
- ✅ Escrow lifecycle
- ✅ Dispute resolution
- ✅ Authorization checks
- ✅ Validation logic

---

## 🔗 External Resources

### Main Documentation
- [Main README](../README.md) - Project overview and quick start
- [Solana Deployment Guide](../DEPLOYMENT.md) - Step-by-step Solana deployment
- [Base Deployment Guide](../DEPLOYMENT_BASE.md) - Step-by-step Base deployment

### Package Documentation
- [TypeScript SDK on npm](https://www.npmjs.com/package/escrowagent-sdk)
- [Python SDK on PyPI](https://pypi.org/project/escrowagent-sdk/)
- [Agent Tools on npm](https://www.npmjs.com/package/escrowagent-agent-tools)

### Blockchain Explorers
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Basescan](https://basescan.org/)
- [Base Sepolia Explorer](https://sepolia.basescan.org/)

### Framework Documentation
- [Anchor Book](https://book.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Next.js Docs](https://nextjs.org/docs)

## 🏗️ Architecture Diagrams

### System Overview

```
┌────────────────────────────────────────────────┐
│              AGENT ECOSYSTEM                   │
│                                                │
│  Agent A ──┐        ┌── Agent B                │
│            ├── SDK ──┤                          │
│  Agent C ──┘        └── Agent D                │
│                                                │
│  AI Tools: LangChain | Vercel AI | MCP         │
└─────────────┬──────────────────────────────────┘
              │
   ┌──────────┼──────────┐
   │          │          │
SOLANA    SHARED      BASE
   │          │          │
┌──▼──┐  ┌───▼───┐  ┌──▼──┐
│Anchor│ │TS SDK │  │ EVM  │
│ Rust │ │+viem+ │  │Solid.│
└──┬──┘  │anchor │  └──┬──┘
   │     └───┬───┘     │
   └─────────┼─────────┘
             ▼
    ┌────────────────┐
    │   Off-Chain    │
    │  • Indexer     │
    │  • API         │
    │  • Dashboard   │
    └────────────────┘
```

### Escrow Lifecycle

```
CREATE → AwaitingProvider
  ├─ cancel  → Cancelled (refund)
  ├─ timeout → Expired (refund)
  └─ accept  → Active
               ├─ dispute → Disputed → resolve → Resolved
               ├─ timeout → Expired
               └─ proof   → ProofSubmitted
                             ├─ confirm → Completed ✓
                             ├─ dispute → Disputed
                             └─ timeout → Expired
```

## 🎓 Learning Path

### Beginner

1. Read [Project Overview](./PROJECT_OVERVIEW.md)
2. Install and run the [Dashboard](./DASHBOARD.md)
3. Explore the [SDK](./SDK.md) examples
4. Create your first escrow using the CLI

### Intermediate

1. Deploy to testnet using [Scripts](./SCRIPTS.md)
2. Run [Tests](./TESTS.md) locally
3. Set up the [Indexer](./INDEXER.md)
4. Build a simple agent using the TypeScript SDK

### Advanced

1. Study the [Solana Program](./PROGRAMS.md) code
2. Review the [Base Contracts](./CONTRACTS.md) implementation
3. Modify and deploy your own version
4. Contribute to the codebase

## 🛠️ Development Workflow

### Local Development Setup

1. **Clone and install**:
   ```bash
   git clone https://github.com/cruellacodes/escrow-agent.git
   cd escrow-agent
   npm install
   ```

2. **Build Solana program**:
   ```bash
   anchor build
   ```

3. **Build Base contracts**:
   ```bash
   cd contracts && forge build
   ```

4. **Run tests**:
   ```bash
   # Solana
   anchor test
   
   # Base
   cd contracts && forge test -vv
   ```

5. **Start indexer**:
   ```bash
   cd indexer && npm run dev
   ```

6. **Start dashboard**:
   ```bash
   cd dashboard && npm run dev
   ```

### Deployment Checklist

- [ ] Tests passing on both chains
- [ ] Contracts built and verified
- [ ] Environment variables configured
- [ ] Wallet funded (SOL for Solana, ETH for Base)
- [ ] Protocol config initialized
- [ ] Indexer running and syncing
- [ ] Dashboard deployed and accessible

## 📝 Contributing

Want to contribute? Here's how:

1. **Find your area**: Pick a component from the docs
2. **Read the guide**: Understand the implementation
3. **Check issues**: Look for "good first issue" labels
4. **Write tests**: Add coverage for new features
5. **Update docs**: Keep documentation in sync

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/cruellacodes/escrow-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/cruellacodes/escrow-agent/discussions)
- **Documentation**: This folder!

## 📄 License

MIT - See [LICENSE](../LICENSE) file for details

---

**Last Updated**: February 2026  
**Version**: 0.2.0 (Multi-chain support)


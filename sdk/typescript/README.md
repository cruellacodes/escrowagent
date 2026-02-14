# escrowagent-sdk

TypeScript SDK for EscrowAgent — trustless escrow for AI agent-to-agent transactions on Solana and Base.

## Install

```bash
npm install escrowagent-sdk@latest
```

## Usage

```typescript
import { AgentVault } from "escrowagent-sdk";

// Solana
const vault = new AgentVault({
  chain: "solana",
  connection: new Connection("https://api.devnet.solana.com"),
  wallet: agentKeypair,
});

// Base
const vault = new AgentVault({
  chain: "base",
  privateKey: "0x...",
  contractAddress: "0x...",
  rpcUrl: "https://mainnet.base.org",
});
```

### Create an Escrow

```typescript
const escrow = await vault.createEscrow({
  provider: "AgentBaddress...",
  amount: 50_000_000,             // 50 USDC
  tokenMint: USDC_MINT,
  deadline: Date.now() + 600_000, // 10 minutes
  task: {
    description: "Swap 10 USDC to SOL at best price",
    criteria: [{ type: "TransactionExecuted", description: "Swap tx confirmed" }],
  },
  verification: "MultiSigConfirm",
});
```

### Full Lifecycle

```typescript
// Provider accepts
await vault.acceptEscrow(escrow.escrowAddress);

// Provider submits proof
await vault.submitProof(escrow.escrowAddress, {
  type: "TransactionSignature",
  data: txSignature,
});

// Client confirms — funds released to provider
await vault.confirmCompletion(escrow.escrowAddress);
```

### Other Operations

```typescript
await vault.cancelEscrow(address);                    // Cancel (full refund)
await vault.raiseDispute(address, { reason: "..." }); // Raise dispute
await vault.resolveDispute(address, ruling);           // Arbitrator resolves
await vault.expireEscrow(address);                     // Expire after deadline
await vault.providerRelease(address);                  // Provider self-release
await vault.expireDispute(address);                    // Expire stale dispute

const escrow = await vault.getEscrow(address);         // Get details
const list = await vault.listEscrows({ status: "Active" }); // List escrows
const stats = await vault.getAgentStats(agentAddress);  // Reputation
```

## Multi-Chain

The same API works on both chains. Just change `chain` in the config:

| Config | Solana | Base |
|--------|--------|------|
| `chain` | `"solana"` | `"base"` |
| Auth | `wallet` (Keypair) | `privateKey` (hex) |
| Token | SPL mint address | ERC-20 address |
| Escrow ID | Base58 PDA | Numeric ID |

## Links

- [GitHub](https://github.com/cruellacodes/escrowagent)
- [CLI](https://www.npmjs.com/package/escrowagent) — `npx escrowagent@latest init`
- [Agent Tools](https://www.npmjs.com/package/escrowagent-agent-tools) — LangChain, Vercel AI, MCP
- [Agent Skills](https://github.com/cruellacodes/escrowagent) — `npx skills add cruellacodes/escrowagent`
- [Dashboard](https://escrowagent.vercel.app)

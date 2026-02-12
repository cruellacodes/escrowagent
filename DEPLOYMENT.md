# AgentVault Deployment Guide

This guide covers deploying the AgentVault escrow protocol to Solana networks (localnet, devnet, and mainnet).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Devnet Deployment](#devnet-deployment)
4. [Mainnet Deployment](#mainnet-deployment)
5. [Post-Deployment](#post-deployment)
6. [Updating Protocol Config](#updating-protocol-config)
7. [Emergency Procedures](#emergency-procedures)
8. [Environment Variables](#environment-variables)

---

## Prerequisites

### Required Software

- **Rust**: `1.75.0` or later
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

- **Solana CLI**: `1.18.0` or later
  ```bash
  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
  ```

- **Anchor CLI**: `0.32.1` (matches `Anchor.toml`)
  ```bash
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install 0.32.1
  avm use 0.32.1
  ```

- **Node.js**: `18.x` or later
  ```bash
  # Using nvm
  nvm install 18
  nvm use 18
  ```

### Verify Installation

```bash
rustc --version        # Should be 1.75.0+
solana --version      # Should be 1.18.0+
anchor --version      # Should be 0.32.1
node --version        # Should be v18.x+
```

---

## Local Development

### 1. Build the Program

```bash
anchor build
```

This compiles the Rust program and generates the IDL in `target/idl/agentvault.json`.

### 2. Start Local Validator

```bash
solana-test-validator
```

In another terminal, configure Solana CLI for localnet:

```bash
solana config set --url localhost
```

### 3. Deploy to Localnet

```bash
anchor deploy
```

### 4. Run Tests

```bash
anchor test
```

Or run tests without starting a validator:

```bash
npm run test:local
```

---

## Devnet Deployment

### Step 1: Configure Solana CLI for Devnet

```bash
solana config set --url devnet
```

Verify configuration:

```bash
solana config get
```

### Step 2: Fund Your Wallet

Get your wallet address:

```bash
solana address
```

Request an airdrop (devnet only):

```bash
solana airdrop 2
# Verify balance
solana balance
```

You need at least **2 SOL** for deployment (program deployment costs ~1.5 SOL on devnet).

### Step 3: Build the Program

```bash
anchor build
```

This generates the program binary in `target/deploy/agentvault.so` and the keypair in `target/deploy/agentvault-keypair.json`.

### Step 4: Extract Program ID

The program ID is derived from the keypair. Extract it:

```bash
solana address -k target/deploy/agentvault-keypair.json
```

Save this address — you'll need to update it across the codebase.

### Step 5: Update Program ID Across Codebase

The program ID must be consistent in **5 files**:

#### 1. `programs/agentvault/src/lib.rs`

```rust
declare_id!("YOUR_PROGRAM_ID_HERE");
```

#### 2. `Anchor.toml`

Update both `[programs.devnet]` and `[programs.localnet]` sections:

```toml
[programs.devnet]
agentvault = "YOUR_PROGRAM_ID_HERE"

[programs.localnet]
agentvault = "YOUR_PROGRAM_ID_HERE"
```

#### 3. `sdk/typescript/src/utils.ts`

```typescript
export const PROGRAM_ID = new PublicKey(
  "YOUR_PROGRAM_ID_HERE"
);
```

#### 4. `sdk/python/agentvault/client.py`

```python
PROGRAM_ID = Pubkey.from_string("YOUR_PROGRAM_ID_HERE")
```

#### 5. `indexer/src/listener.ts`

```typescript
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "YOUR_PROGRAM_ID_HERE"
);
```

**Note**: The deployment script (`scripts/deploy.sh`) automates this process.

### Step 6: Rebuild After Program ID Update

After updating the program ID, rebuild:

```bash
anchor build
```

### Step 7: Deploy

```bash
anchor deploy --provider.cluster devnet
```

Or use the deployment script:

```bash
./scripts/deploy.sh --network devnet
```

### Step 8: Initialize Protocol

After deployment, initialize the protocol config:

```bash
# Using the TypeScript script
npx ts-node scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>

# Or manually with Anchor
anchor run initialize_protocol -- --fee-wallet <FEE_WALLET_ADDRESS> \
  --protocol-fee-bps 50 \
  --arbitrator-fee-bps 100 \
  --min-escrow-amount 1000000 \
  --max-escrow-amount 1000000000000
```

**TypeScript Example**:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.Agentvault;

// Derive config PDA
const [configPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol_config")],
  program.programId
);

// Fee wallet (replace with your address)
const feeWallet = new PublicKey("YOUR_FEE_WALLET_ADDRESS");

await program.methods
  .initializeProtocol(
    feeWallet,
    50,   // 0.5% protocol fee
    100,  // 1.0% arbitrator fee
    new anchor.BN(1_000_000),      // min: 1 USDC
    new anchor.BN(1_000_000_000_000) // max: 1M USDC (0 = no limit)
  )
  .accounts({
    admin: provider.wallet.publicKey,
    config: configPDA,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log("Protocol initialized!");
console.log("Config PDA:", configPDA.toBase58());
```

---

## Mainnet Deployment

**⚠️ WARNING**: Mainnet deployment is **irreversible**. Test thoroughly on devnet first.

### Extra Security Steps

#### 1. Use a Multisig for Admin

**Never** use a single-keypair wallet as the admin on mainnet. Use a **multisig**:

```bash
# Create a multisig (example: 2-of-3)
spl-token create-multisig 2 <KEYPAIR1> <KEYPAIR2> <KEYPAIR3>

# Or use Squads Protocol / Realms for on-chain governance
```

Set the multisig address as the admin during `initialize_protocol`.

#### 2. Verify Program Source Code

Before deploying, verify your program with `solana-verify`:

```bash
# Install solana-verify
cargo install solana-verify

# Verify the program
solana-verify verify \
  --program-id <YOUR_PROGRAM_ID> \
  --source programs/agentvault/src \
  --library-path target/deploy/agentvault.so
```

#### 3. Set Upgrade Authority to Multisig

After deployment, transfer upgrade authority to your multisig:

```bash
solana program set-upgrade-authority <YOUR_PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_ADDRESS>
```

#### 4. Deploy to Mainnet

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Ensure you have enough SOL (deployment costs ~5-10 SOL)
solana balance

# Deploy
anchor deploy --provider.cluster mainnet-beta
```

#### 5. Initialize Protocol

Same as devnet, but use your **multisig** as the admin signer:

```bash
# Use multisig to sign the initialize transaction
# (Implementation depends on your multisig solution)
```

---

## Post-Deployment

### 1. Indexer Setup

The indexer listens for on-chain events and maintains an off-chain database.

#### Environment Variables

Create `indexer/.env`:

```bash
# See Environment Variables section below
```

#### Start Indexer

```bash
cd indexer
npm install
npm run start
```

The indexer will:
- Subscribe to program logs
- Parse `EscrowCreated`, `EscrowAccepted`, `EscrowCompleted`, etc. events
- Store escrow data in PostgreSQL
- Expose REST API endpoints

### 2. Dashboard Setup

The dashboard is a Next.js app that queries the indexer API.

```bash
cd dashboard
npm install

# Set environment variables
NEXT_PUBLIC_INDEXER_URL=http://localhost:3001
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=<YOUR_PROGRAM_ID>

npm run dev
```

### 3. SDK Publishing

#### TypeScript SDK

```bash
cd sdk/typescript
npm run build
npm publish --access public
```

#### Python SDK

```bash
cd sdk/python
python -m build
python -m twine upload dist/*
```

---

## Updating Protocol Config

Only the admin can update protocol config. Use `update_protocol_config`:

```typescript
import * as anchor from "@coral-xyz/anchor";

const program = anchor.workspace.Agentvault;
const [configPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol_config")],
  program.programId
);

// Update fees (50 bps = 0.5%)
await program.methods
  .updateProtocolConfig({
    feeWallet: null,              // Keep current
    protocolFeeBps: 50,          // Update to 0.5%
    arbitratorFeeBps: null,        // Keep current
    minEscrowAmount: null,         // Keep current
    maxEscrowAmount: null,        // Keep current
    paused: null,                 // Keep current
  })
  .accounts({
    admin: provider.wallet.publicKey,
    config: configPDA,
  })
  .rpc();
```

### Common Updates

#### Change Fee Wallet

```typescript
await program.methods
  .updateProtocolConfig({
    feeWallet: new PublicKey("NEW_FEE_WALLET_ADDRESS"),
    // ... other fields null
  })
  .accounts({ admin, config })
  .rpc();
```

#### Pause Protocol

```typescript
await program.methods
  .updateProtocolConfig({
    paused: true,
    // ... other fields null
  })
  .accounts({ admin, config })
  .rpc();
```

#### Transfer Admin Authority

```typescript
// This requires a custom instruction or upgrade
// For now, admin transfer is not implemented in the program
// Consider using a multisig that can rotate keys
```

---

## Emergency Procedures

### Pause Protocol

If you need to pause the protocol (e.g., critical bug discovered):

```typescript
await program.methods
  .updateProtocolConfig({
    paused: true,
  })
  .accounts({ admin, config })
  .rpc();
```

**What happens to active escrows?**

- ✅ **Active escrows continue**: Existing escrows can still be completed, cancelled, or expired
- ❌ **New escrows blocked**: `create_escrow` will fail with `ProtocolPaused` error
- ✅ **Funds safe**: All funds remain in escrow vaults

### Unpause Protocol

```typescript
await program.methods
  .updateProtocolConfig({
    paused: false,
  })
  .accounts({ admin, config })
  .rpc();
```

### Upgrade Program

If you need to upgrade the program:

```bash
# Build new version
anchor build

# Deploy upgrade
anchor upgrade target/deploy/agentvault.so \
  --program-id <YOUR_PROGRAM_ID> \
  --provider.cluster mainnet-beta
```

**Note**: Upgrade authority must be set correctly. On mainnet, use a multisig.

---

## Environment Variables

### Indexer (`indexer/.env`)

```bash
# Solana RPC endpoint
SOLANA_RPC_URL=https://api.devnet.solana.com
# For mainnet: https://api.mainnet-beta.solana.com
# Or use a private RPC: https://your-rpc-provider.com

# AgentVault program ID
PROGRAM_ID=YOUR_PROGRAM_ID_HERE

# PostgreSQL connection
DATABASE_URL=postgresql://user:password@localhost:5432/agentvault

# API server
PORT=3001
HOST=0.0.0.0

# CORS origin (use specific domain in production)
CORS_ORIGIN=*

# Optional: Helius API key for webhooks
HELIUS_API_KEY=your_helius_api_key
```

### Dashboard (`dashboard/.env.local`)

```bash
NEXT_PUBLIC_INDEXER_URL=http://localhost:3001
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU  # devnet
# Mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Deployment Script

The deployment script uses environment variables:

```bash
export ANCHOR_PROVIDER_CLUSTER=devnet  # or mainnet-beta
export ANCHOR_WALLET=~/.config/solana/id.json
```

---

## Troubleshooting

### "Program account does not exist"

- Ensure you've deployed: `anchor deploy`
- Check program ID matches across all files
- Verify on-chain: `solana program show <PROGRAM_ID>`

### "Insufficient funds"

- Check balance: `solana balance`
- Request airdrop (devnet only): `solana airdrop 2`

### "Config account not initialized"

- Run `initialize_protocol` after deployment
- Verify config PDA: `solana account <CONFIG_PDA>`

### "Protocol paused"

- Check config: Query the `ProtocolConfig` account
- Unpause if needed: `update_protocol_config({ paused: false })`

---

## Additional Resources

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [SPL Token Program](https://spl.solana.com/token)
- [Solana Cookbook](https://solanacookbook.com/)

---

## Support

For issues or questions:
- GitHub Issues: [Your Repo URL]
- Discord: [Your Discord Link]
- Documentation: [Your Docs URL]

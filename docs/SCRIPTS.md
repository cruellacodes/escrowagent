# Scripts (Deployment & Testing)

The `scripts/` directory contains deployment scripts and utilities for managing the EscrowAgent protocol on Solana and Base.

## Overview

Scripts automate common tasks like:
- Deploying the Solana program
- Initializing protocol configuration
- Testing on devnet
- Managing upgrades

## Directory Structure

```
scripts/
├── deploy.sh                   # Solana deployment script
├── initialize_protocol.ts      # Initialize protocol config (Solana)
└── test_devnet.ts              # Devnet testing script
```

## Deployment Scripts

### `deploy.sh`

**Purpose**: Deploy the Anchor program to Solana (devnet or mainnet).

**Usage**:
```bash
# Deploy to devnet
./scripts/deploy.sh --network devnet

# Deploy to mainnet
./scripts/deploy.sh --network mainnet
```

**What it does**:

1. **Validate environment**
   - Check Solana CLI installed
   - Check Anchor CLI installed
   - Verify wallet has sufficient SOL

2. **Build program**
   ```bash
   anchor build
   ```

3. **Set cluster**
   ```bash
   solana config set --url <RPC_URL>
   ```

4. **Deploy**
   ```bash
   anchor deploy --provider.cluster <network>
   ```

5. **Display program ID**
   ```bash
   solana address -k target/deploy/escrowagent-keypair.json
   ```

**Environment Variables**:
- `ANCHOR_WALLET`: Path to deployer keypair (default: `~/.config/solana/id.json`)
- `SOLANA_RPC_URL`: Optional override for RPC endpoint

**Example**:
```bash
#!/bin/bash
set -e

NETWORK=${1:-devnet}

echo "Deploying to $NETWORK..."

# Build
anchor build

# Set cluster
if [ "$NETWORK" = "mainnet" ]; then
  solana config set --url https://api.mainnet-beta.solana.com
else
  solana config set --url https://api.devnet.solana.com
fi

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Wallet balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
  echo "Error: Insufficient balance (need at least 2 SOL)"
  exit 1
fi

# Deploy
anchor deploy --provider.cluster $NETWORK

# Show program ID
PROGRAM_ID=$(solana address -k target/deploy/escrowagent-keypair.json)
echo "Program deployed: $PROGRAM_ID"
```

**Cost**:
- Devnet: Free (use `solana airdrop`)
- Mainnet: ~2-3 SOL (rent + deployment fees)

---

### `initialize_protocol.ts`

**Purpose**: Initialize the protocol config PDA after deployment.

**Usage**:
```bash
# Initialize with default config
npx tsx scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>

# With custom parameters
npx tsx scripts/initialize_protocol.ts <FEE_WALLET> \
  --protocol-fee 50 \
  --arbitrator-fee 100 \
  --min-amount 1000 \
  --max-amount 1000000000000 \
  --min-grace 300 \
  --max-deadline 604800
```

**Parameters**:

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `feeWallet` | ✅ | — | Address to receive protocol fees |
| `--protocol-fee` | ❌ | 50 | Protocol fee in bps (0.5%) |
| `--arbitrator-fee` | ❌ | 100 | Arbitrator fee in bps (1.0%) |
| `--min-amount` | ❌ | 1000 | Minimum escrow amount |
| `--max-amount` | ❌ | u64::MAX | Maximum escrow amount |
| `--min-grace` | ❌ | 300 | Minimum grace period (seconds) |
| `--max-deadline` | ❌ | 604800 | Maximum deadline (7 days) |

**What it does**:

1. **Load wallet**
   ```typescript
   const wallet = Keypair.fromSecretKey(
     Buffer.from(JSON.parse(process.env.ANCHOR_WALLET))
   );
   ```

2. **Connect to cluster**
   ```typescript
   const connection = new Connection(
     process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
     "confirmed"
   );
   ```

3. **Initialize program**
   ```typescript
   const program = new Program(IDL, PROGRAM_ID, provider);
   ```

4. **Derive config PDA**
   ```typescript
   const [configPDA] = PublicKey.findProgramAddressSync(
     [Buffer.from("config")],
     program.programId
   );
   ```

5. **Call initialize_protocol**
   ```typescript
   const tx = await program.methods
     .initializeProtocol(
       feeAuthority,
       protocolFeeBps,
       arbitratorFeeBps,
       minEscrowAmount,
       maxEscrowAmount,
       minGracePeriod,
       maxDeadlineSeconds
     )
     .accounts({
       protocolConfig: configPDA,
       admin: wallet.publicKey,
       systemProgram: SystemProgram.programId,
     })
     .rpc();
   ```

6. **Verify on-chain**
   ```typescript
   const config = await program.account.protocolConfig.fetch(configPDA);
   console.log("Protocol initialized:");
   console.log("  Admin:", config.adminAuthority.toBase58());
   console.log("  Fee wallet:", config.feeAuthority.toBase58());
   console.log("  Protocol fee:", config.protocolFeeBps, "bps");
   ```

**Environment Variables**:
- `ANCHOR_WALLET`: JSON array of keypair bytes
- `SOLANA_RPC_URL`: Solana RPC endpoint
- `PROGRAM_ID`: Optional program ID override

**Example**:
```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Escrowagent } from "../target/types/escrowagent";
import IDL from "../target/idl/escrowagent.json";

const PROGRAM_ID = new PublicKey("8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py");

async function main() {
  const feeWallet = new PublicKey(process.argv[2]);
  
  const wallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.ANCHOR_WALLET!))
  );
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  
  const program = new Program<Escrowagent>(IDL as any, PROGRAM_ID, provider);
  
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  
  console.log("Initializing protocol...");
  console.log("Admin:", wallet.publicKey.toBase58());
  console.log("Fee wallet:", feeWallet.toBase58());
  
  const tx = await program.methods
    .initializeProtocol(
      feeWallet,
      50,        // 0.5% protocol fee
      100,       // 1.0% arbitrator fee
      new anchor.BN(1000),
      new anchor.BN("18446744073709551615"),  // u64::MAX
      new anchor.BN(300),     // 5 min
      new anchor.BN(604800)   // 7 days
    )
    .accounts({
      protocolConfig: configPDA,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log("Transaction signature:", tx);
  
  // Verify
  const config = await program.account.protocolConfig.fetch(configPDA);
  console.log("\n✓ Protocol initialized successfully");
  console.log("Config PDA:", configPDA.toBase58());
  console.log("Protocol fee:", config.protocolFeeBps, "bps");
  console.log("Arbitrator fee:", config.arbitratorFeeBps, "bps");
}

main().catch(console.error);
```

**Cost**: ~0.001 SOL (transaction + rent)

---

### `test_devnet.ts`

**Purpose**: Run end-to-end tests on devnet with real transactions.

**Usage**:
```bash
npx tsx scripts/test_devnet.ts
```

**What it does**:

1. **Setup**
   - Load test wallets (client, provider, arbitrator)
   - Mint test USDC (or use devnet faucet)
   - Fund wallets with SOL

2. **Test scenarios**

   **Happy path**:
   ```typescript
   // 1. Create escrow
   const escrow = await createEscrow({
     provider: providerPubkey,
     amount: 50_000_000,  // 50 USDC
     tokenMint: USDC_DEVNET_MINT,
     deadline: Date.now() + 600_000,
     task: { /* ... */ },
   });
   
   // 2. Provider accepts
   await acceptEscrow(escrow.address);
   
   // 3. Provider submits proof
   await submitProof(escrow.address, txSignature);
   
   // 4. Client confirms
   await confirmCompletion(escrow.address);
   
   // 5. Verify balances
   assertBalance(provider, 49_750_000);  // 50 USDC - 0.5% fee
   assertBalance(feeWallet, 250_000);    // 0.5% fee
   ```

   **Cancellation**:
   ```typescript
   const escrow = await createEscrow({/* ... */});
   await cancelEscrow(escrow.address);
   assertBalance(client, originalBalance);  // Full refund
   ```

   **Expiry**:
   ```typescript
   const escrow = await createEscrow({
     deadline: Date.now() + 5000,  // 5 seconds
   });
   await sleep(6000);
   await expireEscrow(escrow.address);
   assertBalance(client, originalBalance);
   ```

   **Dispute**:
   ```typescript
   const escrow = await createEscrow({
     arbitrator: arbitratorPubkey,
   });
   await acceptEscrow(escrow.address);
   await raiseDispute(escrow.address, "Provider didn't deliver");
   await resolveDispute(escrow.address, { ruling: "PayClient" });
   assertBalance(client, originalBalance);
   ```

3. **Cleanup**
   - Close test accounts
   - Return SOL to faucet

**Environment Variables**:
- `CLIENT_KEYPAIR`: Client test wallet
- `PROVIDER_KEYPAIR`: Provider test wallet
- `ARBITRATOR_KEYPAIR`: Arbitrator test wallet
- `SOLANA_RPC_URL`: Devnet RPC
- `PROGRAM_ID`: EscrowAgent program ID

**Example output**:
```
Running devnet tests...

✓ Create escrow (2.5s)
✓ Accept escrow (1.8s)
✓ Submit proof (1.6s)
✓ Confirm completion (2.1s)
✓ Cancel escrow (1.7s)
✓ Expire escrow (3.2s)
✓ Raise dispute (1.9s)
✓ Resolve dispute (2.4s)

8 passing (18s)
```

**Cost**: ~0.05 SOL (transaction fees for all tests)

---

## Base Deployment (Foundry)

Base deployment uses Foundry scripts in `contracts/script/`.

### Deploy to Base Sepolia

```bash
cd contracts

# Set env vars
export DEPLOYER_PRIVATE_KEY=0x...
export BASESCAN_API_KEY=...

# Deploy
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify
```

### Deploy MockUSDC (Testing)

```bash
forge script script/DeployMockUSDC.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast
```

**Output**:
```
== Logs ==
  Deploying MockUSDC...
  MockUSDC deployed at: 0x1234...
  Minted 1,000,000 USDC to deployer
```

---

## Utility Scripts

### Update Protocol Config

```typescript
// scripts/update_config.ts
import { program } from "./setup";

const [configPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  program.programId
);

await program.methods
  .updateProtocolConfig({
    protocolFeeBps: { some: 60 },  // Change to 0.6%
    paused: { some: false },
  })
  .accounts({
    protocolConfig: configPDA,
    admin: wallet.publicKey,
  })
  .rpc();

console.log("Config updated");
```

### Airdrop Devnet SOL

```bash
# scripts/airdrop.sh
solana airdrop 2 <WALLET_ADDRESS> --url devnet
```

### Check Program Account

```typescript
// scripts/check_escrow.ts
const escrowPDA = new PublicKey(process.argv[2]);
const escrow = await program.account.escrow.fetch(escrowPDA);

console.log("Escrow:", {
  client: escrow.client.toBase58(),
  provider: escrow.provider.toBase58(),
  amount: escrow.amount.toString(),
  status: Object.keys(escrow.status)[0],
  deadline: new Date(escrow.deadline * 1000).toISOString(),
});
```

---

## Running Scripts

### Solana

```bash
# Deploy
./scripts/deploy.sh --network devnet

# Initialize
npx tsx scripts/initialize_protocol.ts <FEE_WALLET>

# Test
npx tsx scripts/test_devnet.ts
```

### Base

```bash
cd contracts

# Deploy
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast

# Verify
forge verify-contract <CONTRACT_ADDRESS> src/EscrowAgent.sol:EscrowAgent --chain-id 84532
```

---

## Best Practices

### Environment Setup

Create `.env` files:

**Solana** (`.env`):
```env
ANCHOR_WALLET=[keypair,bytes]
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py
```

**Base** (`contracts/.env`):
```env
DEPLOYER_PRIVATE_KEY=0x...
ADMIN_ADDRESS=0x...
FEE_AUTHORITY=0x...
BASESCAN_API_KEY=...
```

### Error Handling

```typescript
try {
  await program.methods.initializeProtocol(/* ... */).rpc();
} catch (error) {
  if (error.code === 0) {
    console.error("Account already initialized");
  } else if (error.logs?.includes("insufficient funds")) {
    console.error("Wallet needs more SOL");
  } else {
    throw error;
  }
}
```

### Transaction Confirmation

```typescript
// Wait for confirmation
const tx = await program.methods./* ... */.rpc();
await connection.confirmTransaction(tx, "confirmed");

// Fetch updated account
const escrow = await program.account.escrow.fetch(escrowPDA);
```

---

## Troubleshooting

### "Insufficient funds"

**Solana**:
```bash
solana balance
solana airdrop 2  # Devnet only
```

**Base**:
- Bridge ETH from L1 at [bridge.base.org](https://bridge.base.org)

### "Account already initialized"

Protocol config can only be initialized once. To reset (devnet only):

```bash
# Close config account (recover rent)
solana program close <CONFIG_PDA> --bypass-warning

# Re-initialize
npx tsx scripts/initialize_protocol.ts <FEE_WALLET>
```

### "Program failed to complete"

Check logs:
```bash
solana logs -u devnet | grep <PROGRAM_ID>
```

Or use verbose RPC:
```typescript
const provider = new AnchorProvider(
  connection,
  wallet,
  { commitment: "confirmed", preflightCommitment: "confirmed" }
);
```

### Foundry verification failed

Retry with `--retries`:
```bash
forge verify-contract <ADDRESS> <CONTRACT>:<NAME> \
  --chain-id 84532 \
  --retries 5
```

---

## Next Steps

- Read [Programs Guide](./PROGRAMS.md) for Solana program details
- Check [Contracts Guide](./CONTRACTS.md) for Base contract details
- See [DEPLOYMENT.md](../DEPLOYMENT.md) and [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md) for full guides

## Resources

- [Anchor CLI Docs](https://www.anchor-lang.com/docs/cli)
- [Solana CLI Reference](https://docs.solana.com/cli)
- [Foundry Book](https://book.getfoundry.sh/)
- [Base Deploy Guide](https://docs.base.org/guides/deploy-smart-contracts)

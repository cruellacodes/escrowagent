# Tests (Integration Tests)

The `tests/` directory contains integration tests for the EscrowAgent Solana program using Anchor's testing framework.

## Overview

The test suite validates all escrow lifecycle scenarios, edge cases, and error conditions using real on-chain transactions on a local validator.

## Directory Structure

```
tests/
├── escrowagent.ts              # Main test suite (Solana)
└── scenarios/                  # Additional test scenarios (if any)
```

## Test Framework

**Framework**: Anchor Test (Mocha + Chai)  
**Runtime**: Local Solana validator (spun up automatically)  
**Language**: TypeScript

### Running Tests

```bash
# Run all tests with local validator
anchor test

# Run without starting validator (assumes already running)
anchor test --skip-local-validator

# Run with verbose output
anchor test -- --grep "Create escrow"

# Run specific file
npx ts-mocha -p ./tsconfig.json tests/escrowagent.ts
```

## Test Suite Structure

### Setup

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrowagent } from "../target/types/escrowagent";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount 
} from "@solana/spl-token";
import { expect } from "chai";

describe("escrowagent", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrowagent as Program<Escrowagent>;
  
  // Test wallets
  let admin: Keypair;
  let feeWallet: Keypair;
  let client: Keypair;
  let provider: Keypair;
  let arbitrator: Keypair;
  
  // Token accounts
  let tokenMint: PublicKey;
  let clientTokenAccount: PublicKey;
  let providerTokenAccount: PublicKey;
  let feeTokenAccount: PublicKey;
  
  // PDAs
  let configPDA: PublicKey;
  let escrowPDA: PublicKey;
  let vaultPDA: PublicKey;
  let vaultAuthorityPDA: PublicKey;

  before(async () => {
    // Initialize wallets
    admin = Keypair.generate();
    feeWallet = Keypair.generate();
    client = Keypair.generate();
    provider = Keypair.generate();
    arbitrator = Keypair.generate();
    
    // Airdrop SOL
    await airdrop(admin.publicKey, 2);
    await airdrop(client.publicKey, 2);
    await airdrop(provider.publicKey, 2);
    
    // Create token mint (USDC mock)
    tokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6  // 6 decimals like USDC
    );
    
    // Create token accounts
    clientTokenAccount = await createAccount(
      provider.connection,
      client,
      tokenMint,
      client.publicKey
    );
    
    providerTokenAccount = await createAccount(
      provider.connection,
      provider,
      tokenMint,
      provider.publicKey
    );
    
    feeTokenAccount = await createAccount(
      provider.connection,
      feeWallet,
      tokenMint,
      feeWallet.publicKey
    );
    
    // Mint test USDC to client
    await mintTo(
      provider.connection,
      client,
      tokenMint,
      clientTokenAccount,
      admin,
      1_000_000_000  // 1000 USDC
    );
    
    // Derive config PDA
    [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
  });
});
```

---

## Test Cases

### 1. Protocol Initialization

```typescript
it("Initialize protocol config", async () => {
  const tx = await program.methods
    .initializeProtocol(
      feeWallet.publicKey,
      50,   // 0.5% protocol fee
      100,  // 1.0% arbitrator fee
      new anchor.BN(1000),                    // min amount
      new anchor.BN("18446744073709551615"),  // max amount (u64::MAX)
      new anchor.BN(300),                     // 5 min grace
      new anchor.BN(604800)                   // 7 day max deadline
    )
    .accounts({
      protocolConfig: configPDA,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();

  const config = await program.account.protocolConfig.fetch(configPDA);
  
  expect(config.adminAuthority.toBase58()).to.equal(admin.publicKey.toBase58());
  expect(config.feeAuthority.toBase58()).to.equal(feeWallet.publicKey.toBase58());
  expect(config.protocolFeeBps).to.equal(50);
  expect(config.arbitratorFeeBps).to.equal(100);
});
```

### 2. Create Escrow

```typescript
it("Create escrow", async () => {
  const taskHash = Buffer.alloc(32);
  crypto.randomFillSync(taskHash);
  
  const deadline = Math.floor(Date.now() / 1000) + 600;  // 10 min
  const amount = new anchor.BN(50_000_000);  // 50 USDC
  
  // Derive PDAs
  [escrowPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      client.publicKey.toBuffer(),
      provider.publicKey.toBuffer(),
      taskHash,
    ],
    program.programId
  );
  
  [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPDA.toBuffer()],
    program.programId
  );
  
  [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-authority"), escrowPDA.toBuffer()],
    program.programId
  );
  
  const tx = await program.methods
    .createEscrow(
      provider.publicKey,
      amount,
      tokenMint,
      new anchor.BN(deadline),
      taskHash,
      { onChain: {} },  // VerificationType
      arbitrator.publicKey,
      new anchor.BN(300)  // 5 min grace
    )
    .accounts({
      escrow: escrowPDA,
      vault: vaultPDA,
      vaultAuthority: vaultAuthorityPDA,
      client: client.publicKey,
      clientTokenAccount,
      protocolConfig: configPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([client])
    .rpc();

  const escrow = await program.account.escrow.fetch(escrowPDA);
  
  expect(escrow.client.toBase58()).to.equal(client.publicKey.toBase58());
  expect(escrow.provider.toBase58()).to.equal(provider.publicKey.toBase58());
  expect(escrow.amount.toString()).to.equal(amount.toString());
  expect(escrow.status).to.deep.equal({ awaitingProvider: {} });
  
  // Verify vault balance
  const vaultAccount = await getAccount(provider.connection, vaultPDA);
  expect(vaultAccount.amount.toString()).to.equal(amount.toString());
});
```

### 3. Accept Escrow

```typescript
it("Provider accepts escrow", async () => {
  const tx = await program.methods
    .acceptEscrow()
    .accounts({
      escrow: escrowPDA,
      provider: provider.publicKey,
    })
    .signers([provider])
    .rpc();

  const escrow = await program.account.escrow.fetch(escrowPDA);
  expect(escrow.status).to.deep.equal({ active: {} });
});
```

### 4. Submit Proof

```typescript
it("Provider submits proof", async () => {
  const proofData = Buffer.from("tx_signature_abc123...");
  
  const tx = await program.methods
    .submitProof(Array.from(proofData))
    .accounts({
      escrow: escrowPDA,
      provider: provider.publicKey,
    })
    .signers([provider])
    .rpc();

  const escrow = await program.account.escrow.fetch(escrowPDA);
  expect(escrow.status).to.deep.equal({ proofSubmitted: {} });
});
```

### 5. Confirm Completion (Happy Path)

```typescript
it("Client confirms completion and releases funds", async () => {
  const clientBalanceBefore = await getTokenBalance(clientTokenAccount);
  const providerBalanceBefore = await getTokenBalance(providerTokenAccount);
  const feeBalanceBefore = await getTokenBalance(feeTokenAccount);
  
  const tx = await program.methods
    .confirmCompletion()
    .accounts({
      escrow: escrowPDA,
      vault: vaultPDA,
      vaultAuthority: vaultAuthorityPDA,
      client: client.publicKey,
      providerTokenAccount,
      feeTokenAccount,
      protocolConfig: configPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([client])
    .rpc();

  const escrow = await program.account.escrow.fetch(escrowPDA);
  expect(escrow.status).to.deep.equal({ completed: {} });
  expect(escrow.completedAt).to.be.greaterThan(0);
  
  // Verify balances
  const providerBalanceAfter = await getTokenBalance(providerTokenAccount);
  const feeBalanceAfter = await getTokenBalance(feeTokenAccount);
  
  const protocolFee = 50_000_000 * 50 / 10000;  // 0.5%
  const providerAmount = 50_000_000 - protocolFee;
  
  expect(providerBalanceAfter - providerBalanceBefore).to.equal(providerAmount);
  expect(feeBalanceAfter - feeBalanceBefore).to.equal(protocolFee);
});
```

### 6. Cancel Escrow

```typescript
it("Client cancels escrow before provider accepts", async () => {
  // Create new escrow
  const { escrow, vault } = await createTestEscrow();
  
  const clientBalanceBefore = await getTokenBalance(clientTokenAccount);
  
  const tx = await program.methods
    .cancelEscrow()
    .accounts({
      escrow,
      vault,
      vaultAuthority: vaultAuthorityPDA,
      client: client.publicKey,
      clientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([client])
    .rpc();

  const escrowAccount = await program.account.escrow.fetch(escrow);
  expect(escrowAccount.status).to.deep.equal({ cancelled: {} });
  
  // Full refund
  const clientBalanceAfter = await getTokenBalance(clientTokenAccount);
  expect(clientBalanceAfter).to.equal(clientBalanceBefore + 50_000_000);
});

it("Cannot cancel after provider accepts", async () => {
  const { escrow } = await createTestEscrow();
  await acceptEscrow(escrow);
  
  try {
    await program.methods
      .cancelEscrow()
      .accounts({
        escrow,
        /* ... */
      })
      .signers([client])
      .rpc();
    
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("InvalidStatus");
  }
});
```

### 7. Expire Escrow

```typescript
it("Expire escrow after deadline + grace", async () => {
  // Create escrow with short deadline
  const { escrow, vault } = await createTestEscrow({
    deadline: Math.floor(Date.now() / 1000) + 5,  // 5 seconds
    gracePeriod: 5,
  });
  
  // Wait for expiry
  await sleep(11000);  // 11 seconds
  
  const tx = await program.methods
    .expireEscrow()
    .accounts({
      escrow,
      vault,
      vaultAuthority: vaultAuthorityPDA,
      clientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const escrowAccount = await program.account.escrow.fetch(escrow);
  expect(escrowAccount.status).to.deep.equal({ expired: {} });
});

it("Cannot expire before deadline + grace", async () => {
  const { escrow } = await createTestEscrow({
    deadline: Math.floor(Date.now() / 1000) + 600,
  });
  
  try {
    await program.methods.expireEscrow().accounts({/* ... */}).rpc();
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("NotYetExpired");
  }
});
```

### 8. Provider Release

```typescript
it("Provider releases funds after grace period", async () => {
  const { escrow } = await createTestEscrow({
    deadline: Math.floor(Date.now() / 1000) + 5,
    gracePeriod: 5,
  });
  
  await acceptEscrow(escrow);
  await submitProof(escrow);
  
  // Wait for grace period
  await sleep(11000);
  
  const providerBalanceBefore = await getTokenBalance(providerTokenAccount);
  
  const tx = await program.methods
    .providerRelease()
    .accounts({
      escrow,
      vault: vaultPDA,
      vaultAuthority: vaultAuthorityPDA,
      provider: provider.publicKey,
      providerTokenAccount,
      feeTokenAccount,
      protocolConfig: configPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([provider])
    .rpc();

  const escrowAccount = await program.account.escrow.fetch(escrow);
  expect(escrowAccount.status).to.deep.equal({ completed: {} });
  
  const providerBalanceAfter = await getTokenBalance(providerTokenAccount);
  expect(providerBalanceAfter).to.be.greaterThan(providerBalanceBefore);
});
```

### 9. Raise Dispute

```typescript
it("Client raises dispute", async () => {
  const { escrow } = await createTestEscrow({ arbitrator: arbitrator.publicKey });
  await acceptEscrow(escrow);
  
  const tx = await program.methods
    .raiseDispute("Provider did not complete task")
    .accounts({
      escrow,
      disputer: client.publicKey,
    })
    .signers([client])
    .rpc();

  const escrowAccount = await program.account.escrow.fetch(escrow);
  expect(escrowAccount.status).to.deep.equal({ disputed: {} });
  expect(escrowAccount.disputeRaisedBy.toBase58()).to.equal(client.publicKey.toBase58());
});

it("Cannot raise dispute without arbitrator", async () => {
  const { escrow } = await createTestEscrow({ arbitrator: null });
  await acceptEscrow(escrow);
  
  try {
    await program.methods.raiseDispute("...").accounts({/* ... */}).rpc();
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("NoArbitrator");
  }
});
```

### 10. Resolve Dispute

```typescript
it("Arbitrator resolves dispute - PayClient", async () => {
  const { escrow } = await createDisputedEscrow();
  
  const clientBalanceBefore = await getTokenBalance(clientTokenAccount);
  
  const tx = await program.methods
    .resolveDispute({ payClient: {} })
    .accounts({
      escrow,
      vault: vaultPDA,
      vaultAuthority: vaultAuthorityPDA,
      arbitrator: arbitrator.publicKey,
      clientTokenAccount,
      providerTokenAccount,
      feeTokenAccount,
      protocolConfig: configPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([arbitrator])
    .rpc();

  const escrowAccount = await program.account.escrow.fetch(escrow);
  expect(escrowAccount.status).to.deep.equal({ resolved: {} });
  
  // Full refund to client
  const clientBalanceAfter = await getTokenBalance(clientTokenAccount);
  expect(clientBalanceAfter - clientBalanceBefore).to.equal(50_000_000);
});

it("Arbitrator resolves dispute - Split", async () => {
  const { escrow } = await createDisputedEscrow();
  
  const tx = await program.methods
    .resolveDispute({
      split: {
        clientBps: 6000,    // 60%
        providerBps: 4000,  // 40%
      }
    })
    .accounts({/* ... */})
    .signers([arbitrator])
    .rpc();

  const clientBalanceAfter = await getTokenBalance(clientTokenAccount);
  const providerBalanceAfter = await getTokenBalance(providerTokenAccount);
  
  expect(clientBalanceAfter).to.equal(30_000_000);   // 60% of 50M
  expect(providerBalanceAfter).to.equal(20_000_000); // 40% of 50M
});
```

### 11. Error Cases

```typescript
it("Cannot create self-escrow", async () => {
  try {
    await program.methods
      .createEscrow(
        client.publicKey,  // Provider = Client
        /* ... */
      )
      .accounts({/* ... */})
      .signers([client])
      .rpc();
    
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("SelfEscrow");
  }
});

it("Cannot create escrow below minimum", async () => {
  try {
    await program.methods
      .createEscrow(
        provider.publicKey,
        new anchor.BN(500),  // Below 1000 min
        /* ... */
      )
      .accounts({/* ... */})
      .rpc();
    
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("AmountTooLow");
  }
});

it("Unauthorized provider cannot accept", async () => {
  const { escrow } = await createTestEscrow();
  const wrongProvider = Keypair.generate();
  
  try {
    await program.methods
      .acceptEscrow()
      .accounts({
        escrow,
        provider: wrongProvider.publicKey,
      })
      .signers([wrongProvider])
      .rpc();
    
    expect.fail("Should have thrown error");
  } catch (error) {
    expect(error.toString()).to.include("UnauthorizedProvider");
  }
});
```

---

## Test Utilities

```typescript
// Helper: Airdrop SOL
async function airdrop(pubkey: PublicKey, amount: number) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    amount * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);
}

// Helper: Get token balance
async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
  const account = await getAccount(provider.connection, tokenAccount);
  return Number(account.amount);
}

// Helper: Sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Create test escrow
async function createTestEscrow(opts?: {
  amount?: number;
  deadline?: number;
  gracePeriod?: number;
  arbitrator?: PublicKey | null;
}): Promise<{ escrow: PublicKey; vault: PublicKey }> {
  // Implementation...
}
```

---

## Running Tests

### Local Validator

```bash
# Anchor handles validator automatically
anchor test
```

### Custom Validator

```bash
# Start validator
solana-test-validator --reset

# In another terminal
anchor test --skip-local-validator
```

### Watch Mode

```bash
# Install nodemon
npm i -g nodemon

# Watch tests
nodemon --watch tests --exec "anchor test --skip-local-validator"
```

---

## Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| **Protocol** | Initialize, update config | ✅ |
| **Happy path** | Create → Accept → Proof → Confirm | ✅ |
| **Cancellation** | Before/after acceptance | ✅ |
| **Expiry** | After deadline, before deadline | ✅ |
| **Provider release** | After grace period | ✅ |
| **Disputes** | Raise, resolve (all rulings) | ✅ |
| **Validation** | Self-escrow, amount limits | ✅ |
| **Authorization** | Unauthorized client/provider/arbitrator | ✅ |
| **Status checks** | Invalid state transitions | ✅ |
| **Events** | All events emitted correctly | ✅ |

**Total**: ~18 tests passing

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      
      - name: Install Solana
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Install Anchor
        run: |
          cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli
      
      - name: Install Node
        uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: anchor test
```

---

## Base Contract Tests (Foundry)

Tests for the Base contract are in `contracts/test/EscrowAgent.t.sol`.

**Run**:
```bash
cd contracts
forge test -vv
```

**Coverage**:
```bash
forge coverage
```

---

## Comparison

| Feature | Solana Tests (Anchor) | Base Tests (Foundry) |
|---------|----------------------|---------------------|
| **Framework** | Mocha + Chai | Foundry (Solidity) |
| **Runtime** | Local validator | Anvil (local EVM) |
| **Language** | TypeScript | Solidity |
| **Speed** | ~18s for 18 tests | ~2s for 18 tests |
| **Setup** | Complex (accounts, PDAs) | Simple (constructor) |
| **Mocking** | Real SPL tokens | MockERC20 |

---

## Next Steps

- Read [Programs Guide](./PROGRAMS.md) for program implementation details
- Check [Contracts Guide](./CONTRACTS.md) for Base contract tests
- See [Scripts Guide](./SCRIPTS.md) for deployment testing

## Resources

- [Anchor Testing](https://www.anchor-lang.com/docs/testing)
- [Solana Test Validator](https://docs.solana.com/developing/test-validator)
- [Foundry Testing](https://book.getfoundry.sh/forge/tests)

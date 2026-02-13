# Programs (Solana/Anchor)

The `programs/` directory contains the **Solana Anchor program** (smart contract) for EscrowAgent on Solana.

## Overview

The Anchor program is a Rust-based smart contract that manages trustless escrows for SPL tokens on Solana. It provides the same functionality as the Base Solidity contract but optimized for Solana's account model.

**Program ID**: `8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py`  
**Framework**: Anchor 0.32.1  
**Network**: Devnet (live), Mainnet (ready to deploy)

## Directory Structure

```
programs/escrowagent/
├── src/
│   ├── lib.rs                      # Program entry point
│   ├── errors.rs                   # Custom error codes
│   ├── events.rs                   # Event definitions
│   ├── instructions/
│   │   ├── mod.rs
│   │   ├── initialize_config.rs    # Protocol initialization
│   │   ├── update_config.rs        # Config updates
│   │   ├── create.rs               # Create escrow
│   │   ├── accept.rs               # Accept escrow
│   │   ├── submit_proof.rs         # Submit proof
│   │   ├── confirm.rs              # Confirm completion
│   │   ├── cancel.rs               # Cancel escrow
│   │   ├── expire.rs               # Expire escrow
│   │   ├── provider_release.rs     # Provider auto-release
│   │   └── dispute.rs              # Raise & resolve disputes
│   └── state/
│       ├── mod.rs
│       ├── config.rs               # ProtocolConfig account
│       ├── escrow.rs               # Escrow account
│       └── enums.rs                # EscrowStatus, VerificationType, etc.
├── Cargo.toml
└── Xargo.toml
```

## Program Architecture

### Account Model

Anchor programs use PDAs (Program Derived Addresses) for account storage.

```
┌─────────────────────────────────────────────────┐
│         PROTOCOL CONFIG (PDA)                   │
│  Seeds: ["config"]                              │
├─────────────────────────────────────────────────┤
│  - admin_authority                              │
│  - fee_authority                                │
│  - protocol_fee_bps (50 = 0.5%)                 │
│  - arbitrator_fee_bps (100 = 1%)                │
│  - min_escrow_amount, max_escrow_amount         │
│  - min_grace_period, max_deadline_seconds       │
│  - paused (bool)                                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         ESCROW ACCOUNT (PDA)                    │
│  Seeds: ["escrow", client, provider, task_hash] │
├─────────────────────────────────────────────────┤
│  - escrow_id (u64)                              │
│  - client (Pubkey)                              │
│  - provider (Pubkey)                            │
│  - arbitrator (Option<Pubkey>)                  │
│  - token_mint (Pubkey)                          │
│  - amount (u64)                                 │
│  - protocol_fee_bps (u16)                       │
│  - status (EscrowStatus enum)                   │
│  - verification_type (VerificationType)         │
│  - task_hash ([u8; 32])                         │
│  - deadline (i64)                               │
│  - grace_period (Option<i64>)                   │
│  - created_at (i64)                             │
│  - completed_at (Option<i64>)                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         VAULT (PDA)                             │
│  Seeds: ["vault", escrow]                       │
├─────────────────────────────────────────────────┤
│  - SPL Token Account (holds escrowed tokens)    │
│  - Authority: vault_authority PDA               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         VAULT AUTHORITY (PDA)                   │
│  Seeds: ["vault-authority", escrow]             │
├─────────────────────────────────────────────────┤
│  - Signer for token transfers out of vault      │
└─────────────────────────────────────────────────┘
```

### State Structs

#### Escrow (`state/escrow.rs`)

```rust
#[account]
pub struct Escrow {
    pub escrow_id: u64,
    pub client: Pubkey,
    pub provider: Pubkey,
    pub arbitrator: Option<Pubkey>,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub protocol_fee_bps: u16,
    pub status: EscrowStatus,
    pub verification_type: VerificationType,
    pub task_hash: [u8; 32],
    pub deadline: i64,
    pub grace_period: Option<i64>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

impl Escrow {
    pub const LEN: usize = 8 + 8 + 32 + 32 + 33 + 32 + 8 + 2 + 1 + 1 + 32 + 8 + 9 + 8 + 9;
}
```

#### ProtocolConfig (`state/config.rs`)

```rust
#[account]
pub struct ProtocolConfig {
    pub admin_authority: Pubkey,
    pub fee_authority: Pubkey,
    pub protocol_fee_bps: u16,
    pub arbitrator_fee_bps: u16,
    pub min_escrow_amount: u64,
    pub max_escrow_amount: u64,
    pub min_grace_period: i64,
    pub max_deadline_seconds: i64,
    pub paused: bool,
}
```

### Enums (`state/enums.rs`)

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    AwaitingProvider,
    Active,
    ProofSubmitted,
    Completed,
    Disputed,
    Resolved,
    Expired,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum VerificationType {
    OnChain,
    OracleCallback,
    MultiSigConfirm,
    AutoRelease,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum DisputeRuling {
    PayClient,
    PayProvider,
    Split { client_bps: u16, provider_bps: u16 },
}
```

## Instructions

### Protocol Admin

#### `initialize_protocol`

Initialize the protocol config (called once by deployer).

**Accounts**:
- `protocol_config` (init, PDA)
- `admin` (signer, payer)
- `system_program`

**Parameters**:
- `fee_authority`: Pubkey
- `protocol_fee_bps`: u16 (default: 50 = 0.5%)
- `arbitrator_fee_bps`: u16 (default: 100 = 1%)
- `min_escrow_amount`: u64 (default: 1000)
- `max_escrow_amount`: u64
- `min_grace_period`: i64 (default: 300 seconds)
- `max_deadline_seconds`: i64 (default: 604800 = 7 days)

**Event**: `ProtocolInitialized`

#### `update_protocol_config`

Update protocol parameters (admin only).

**Accounts**:
- `protocol_config` (mut)
- `admin` (signer, must match `admin_authority`)

**Parameters**:
- `update`: ConfigUpdate struct (all fields optional)

**Event**: `ProtocolConfigUpdated`

### Escrow Lifecycle

#### `create_escrow`

Client locks tokens in escrow.

**Accounts**:
- `escrow` (init, PDA: ["escrow", client, provider, task_hash])
- `vault` (init, PDA: ["vault", escrow])
- `vault_authority` (PDA: ["vault-authority", escrow])
- `client` (signer)
- `client_token_account` (mut)
- `protocol_config`
- `token_program`
- `system_program`

**Parameters**:
- `provider`: Pubkey
- `amount`: u64
- `token_mint`: Pubkey
- `deadline`: i64
- `task_hash`: [u8; 32]
- `verification_type`: VerificationType
- `arbitrator`: Option<Pubkey>
- `grace_period`: Option<i64>

**Constraints**:
- Client != provider
- Amount >= min_escrow_amount
- Amount <= max_escrow_amount
- Deadline <= now + max_deadline_seconds
- Grace period >= min_grace_period (if provided)

**Actions**:
1. Create escrow PDA
2. Create vault token account
3. Transfer tokens from client to vault
4. Emit `EscrowCreated`

**Event**: `EscrowCreated`

#### `accept_escrow`

Provider accepts the escrow.

**Accounts**:
- `escrow` (mut)
- `provider` (signer, must match escrow.provider)

**Constraints**:
- Status == AwaitingProvider
- Deadline not passed

**Actions**:
1. Update status to Active
2. Emit `EscrowAccepted`

**Event**: `EscrowAccepted`

#### `submit_proof`

Provider submits proof of completion.

**Accounts**:
- `escrow` (mut)
- `provider` (signer, must match escrow.provider)

**Parameters**:
- `proof_data`: Vec<u8>

**Constraints**:
- Status == Active
- Deadline not passed

**Actions**:
1. Update status to ProofSubmitted
2. Emit `EscrowProofSubmitted`

**Event**: `EscrowProofSubmitted { escrow, proof_data }`

#### `confirm_completion`

Client confirms and releases funds to provider.

**Accounts**:
- `escrow` (mut)
- `vault` (mut)
- `vault_authority` (PDA)
- `client` (signer, must match escrow.client)
- `provider_token_account` (mut)
- `fee_token_account` (mut)
- `protocol_config`
- `token_program`

**Constraints**:
- Status == ProofSubmitted or Active
- Caller is client

**Actions**:
1. Calculate fees:
   - `protocol_fee = amount * protocol_fee_bps / 10000`
   - `provider_amount = amount - protocol_fee`
2. Transfer `provider_amount` to provider
3. Transfer `protocol_fee` to fee_authority
4. Update status to Completed
5. Set `completed_at` to current timestamp
6. Emit `EscrowCompleted`

**Event**: `EscrowCompleted`

#### `cancel_escrow`

Client cancels before provider accepts (full refund).

**Accounts**:
- `escrow` (mut)
- `vault` (mut)
- `vault_authority` (PDA)
- `client` (signer, must match escrow.client)
- `client_token_account` (mut)
- `token_program`

**Constraints**:
- Status == AwaitingProvider
- Caller is client

**Actions**:
1. Transfer full amount back to client
2. Update status to Cancelled
3. Emit `EscrowCancelled`

**Event**: `EscrowCancelled`

#### `expire_escrow`

Expire escrow after deadline + grace (anyone can call).

**Accounts**:
- `escrow` (mut)
- `vault` (mut)
- `vault_authority` (PDA)
- `client_token_account` (mut)
- `token_program`

**Constraints**:
- Current time > deadline + grace_period
- Status in [AwaitingProvider, Active, ProofSubmitted]

**Actions**:
1. Transfer full amount back to client
2. Update status to Expired
3. Emit `EscrowExpired`

**Event**: `EscrowExpired`

#### `provider_release`

Provider releases funds after grace period if client doesn't confirm.

**Accounts**:
- `escrow` (mut)
- `vault` (mut)
- `vault_authority` (PDA)
- `provider` (signer, must match escrow.provider)
- `provider_token_account` (mut)
- `fee_token_account` (mut)
- `protocol_config`
- `token_program`

**Constraints**:
- Status == ProofSubmitted
- Current time > deadline + grace_period

**Actions**:
Same as `confirm_completion` (fees + transfer)

**Event**: `EscrowCompleted`

### Dispute Resolution

#### `raise_dispute`

Client or provider raises a dispute.

**Accounts**:
- `escrow` (mut)
- `disputer` (signer, must be client or provider)

**Parameters**:
- `reason`: String

**Constraints**:
- Status in [Active, ProofSubmitted]
- Escrow has an arbitrator
- Caller is client or provider

**Actions**:
1. Update status to Disputed
2. Emit `DisputeRaised`

**Event**: `DisputeRaised { escrow, raised_by, reason }`

#### `resolve_dispute`

Arbitrator resolves the dispute.

**Accounts**:
- `escrow` (mut)
- `vault` (mut)
- `vault_authority` (PDA)
- `arbitrator` (signer, must match escrow.arbitrator)
- `client_token_account` (mut)
- `provider_token_account` (mut)
- `fee_token_account` (mut)
- `protocol_config`
- `token_program`

**Parameters**:
- `ruling`: DisputeRuling

**Constraints**:
- Status == Disputed
- Caller is arbitrator

**Actions**:

**PayClient**:
1. Transfer full amount to client
2. No fees

**PayProvider**:
1. Calculate fees (same as completion)
2. Transfer to provider and fee_authority

**Split { client_bps, provider_bps }**:
1. Validate: client_bps + provider_bps == 10000
2. Split amount accordingly
3. Deduct protocol + arbitrator fees from provider's share

**All cases**:
1. Update status to Resolved
2. Emit `DisputeResolved`

**Event**: `DisputeResolved { escrow, ruling }`

## Events (`events.rs`)

All events are emitted via Anchor's `#[event]` macro.

```rust
#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub provider: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub deadline: i64,
    pub task_hash: [u8; 32],
    pub verification_type: VerificationType,
}

#[event]
pub struct EscrowAccepted {
    pub escrow: Pubkey,
}

#[event]
pub struct EscrowProofSubmitted {
    pub escrow: Pubkey,
    pub proof_data: Vec<u8>,
}

#[event]
pub struct EscrowCompleted {
    pub escrow: Pubkey,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
}

#[event]
pub struct EscrowExpired {
    pub escrow: Pubkey,
}

#[event]
pub struct DisputeRaised {
    pub escrow: Pubkey,
    pub raised_by: Pubkey,
    pub reason: String,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub ruling: DisputeRuling,
}

#[event]
pub struct ProtocolInitialized {
    pub admin_authority: Pubkey,
    pub fee_authority: Pubkey,
}

#[event]
pub struct ProtocolConfigUpdated {
    pub updated_by: Pubkey,
}
```

## Errors (`errors.rs`)

Custom error codes for better diagnostics.

```rust
#[error_code]
pub enum EscrowError {
    #[msg("Deadline has passed")]
    DeadlinePassed,
    
    #[msg("Escrow is not in the expected status")]
    InvalidStatus,
    
    #[msg("Only the client can perform this action")]
    UnauthorizedClient,
    
    #[msg("Only the provider can perform this action")]
    UnauthorizedProvider,
    
    #[msg("Only the arbitrator can perform this action")]
    UnauthorizedArbitrator,
    
    #[msg("Client and provider must be different")]
    SelfEscrow,
    
    #[msg("Amount is below minimum")]
    AmountTooLow,
    
    #[msg("Amount exceeds maximum")]
    AmountTooHigh,
    
    #[msg("Deadline too far in the future")]
    DeadlineTooFar,
    
    #[msg("Grace period too short")]
    GracePeriodTooShort,
    
    #[msg("Cannot expire before deadline + grace")]
    NotYetExpired,
    
    #[msg("Dispute requires an arbitrator")]
    NoArbitrator,
    
    #[msg("Invalid dispute ruling split (must sum to 10000 bps)")]
    InvalidSplit,
    
    #[msg("Protocol is paused")]
    ProtocolPaused,
}
```

## PDA Derivation

### Escrow PDA

```rust
let (escrow_pda, bump) = Pubkey::find_program_address(
    &[
        b"escrow",
        client.as_ref(),
        provider.as_ref(),
        &task_hash,
    ],
    program_id,
);
```

### Vault PDA

```rust
let (vault_pda, bump) = Pubkey::find_program_address(
    &[b"vault", escrow.key().as_ref()],
    program_id,
);
```

### Vault Authority PDA

```rust
let (vault_authority, bump) = Pubkey::find_program_address(
    &[b"vault-authority", escrow.key().as_ref()],
    program_id,
);
```

### Protocol Config PDA

```rust
let (config_pda, bump) = Pubkey::find_program_address(
    &[b"config"],
    program_id,
);
```

## Build & Deploy

### Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor CLI 0.32.1

```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli

# Verify
anchor --version  # Should show 0.32.1
```

### Build

```bash
# From project root
anchor build

# Check program ID
solana address -k target/deploy/escrowagent-keypair.json
```

### Test

```bash
# Run integration tests
anchor test

# Run specific test
anchor test --skip-local-validator
```

### Deploy

#### Devnet

```bash
# Set cluster
solana config set --url https://api.devnet.solana.com

# Airdrop SOL for deployment (if needed)
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet

# Initialize protocol
npx tsx scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>
```

#### Mainnet

```bash
# Set cluster
solana config set --url https://api.mainnet-beta.solana.com

# Deploy (requires ~2-3 SOL for rent + fees)
anchor deploy --provider.cluster mainnet

# Initialize
npx tsx scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>
```

### Upgrade

```bash
# Build new version
anchor build

# Upgrade (requires upgrade authority)
solana program upgrade target/deploy/escrowagent.so <PROGRAM_ID>
```

## Testing

Tests are in `tests/escrowagent.ts`.

**Test coverage**:
- ✅ Initialize protocol
- ✅ Create escrow
- ✅ Accept escrow
- ✅ Submit proof
- ✅ Confirm completion (happy path)
- ✅ Cancel before acceptance
- ✅ Expire after deadline
- ✅ Provider release
- ✅ Raise dispute
- ✅ Resolve dispute (PayClient, PayProvider, Split)
- ✅ Error cases (self-escrow, amount limits, unauthorized, etc.)

**Run tests**:

```bash
anchor test
```

**Output**:
```
escrowagent
  ✔ Initialize protocol (500ms)
  ✔ Create escrow (800ms)
  ✔ Accept escrow (600ms)
  ✔ Complete escrow (900ms)
  ✔ Cancel escrow (700ms)
  ...

18 passing (15s)
```

## Program Size

```bash
solana program show 8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py

# Program Size: ~120 KB
# Rent: ~0.84 SOL
```

## Security Features

### Anchor Constraints

Anchor provides built-in security via attribute macros:

```rust
#[account(
    mut,
    constraint = escrow.client == client.key() @ EscrowError::UnauthorizedClient,
    constraint = escrow.status == EscrowStatus::ProofSubmitted @ EscrowError::InvalidStatus,
)]
pub escrow: Account<'info, Escrow>,
```

### PDA Ownership

All PDAs are owned by the program, preventing external modification:

```rust
#[account(
    init,
    payer = client,
    space = 8 + Escrow::LEN,
    seeds = [b"escrow", client.key().as_ref(), provider.as_ref(), &task_hash],
    bump,
)]
pub escrow: Account<'info, Escrow>,
```

### Signer Checks

Critical operations require signer verification:

```rust
pub client: Signer<'info>,
pub provider: Signer<'info>,
pub arbitrator: Signer<'info>,
```

### Integer Overflow Protection

Rust's default overflow checks prevent arithmetic bugs:

```rust
let protocol_fee = escrow
    .amount
    .checked_mul(escrow.protocol_fee_bps as u64)
    .unwrap()
    .checked_div(10000)
    .unwrap();
```

## Gas Optimization

- Use `u16` for basis points (vs `u64`)
- Use `Option<>` for optional fields (saves space)
- Packed enums (1 byte each)
- Reuse PDAs instead of creating new accounts

## Known Limitations

1. **No batch operations** - Each escrow requires separate transactions
2. **Single token per escrow** - Can't mix SPL tokens
3. **Fixed fee structure** - Fees set at protocol level, not per-escrow
4. **No upgradeable escrows** - Once created, parameters are immutable

## Comparison with Base Contract

| Feature | Solana (Anchor) | Base (Solidity) |
|---------|----------------|-----------------|
| **Custody** | PDA vault account | Contract balance |
| **ID** | Base58 PDA | Numeric counter |
| **Duplicate check** | PDA seeds (automatic) | Mapping + hash |
| **Pausable** | Config flag | OpenZeppelin Pausable |
| **Token transfer** | CPI to token program | SafeERC20 library |
| **Rent** | ~0.002 SOL per escrow | No rent (EVM) |
| **Transaction cost** | ~0.0001 SOL | ~$0.50-2 in ETH |

## IDL (Interface Definition Language)

The IDL is auto-generated by Anchor and used by clients:

```bash
# Generated at
target/idl/escrowagent.json
```

**Used by**:
- TypeScript SDK (`@coral-xyz/anchor`)
- Python SDK (`anchorpy`)
- Indexer event parser
- Dashboard queries

## Upgrade Authority

```bash
# Show current upgrade authority
solana program show 8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py

# Transfer upgrade authority
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <NEW_AUTHORITY>

# Make immutable (irreversible!)
solana program set-upgrade-authority <PROGRAM_ID> --final
```

## Next Steps

- Read [SDK Guide](./SDK.md) to interact with the program
- Check [Indexer Guide](./INDEXER.md) for event tracking
- See [DEPLOYMENT.md](../DEPLOYMENT.md) for full deployment guide
- Review [Tests Guide](./TESTS.md) for test suite details

## Resources

- [Anchor Book](https://book.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [SPL Token Docs](https://spl.solana.com/token)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)

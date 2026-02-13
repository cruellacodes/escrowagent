# Contracts (Base/EVM)

The `contracts/` directory contains the **Base (EVM)** implementation of the EscrowAgent protocol using Solidity and Foundry.

## Overview

EscrowAgent on Base is a Solidity smart contract that manages trustless escrows for ERC-20 tokens. It provides the same functionality as the Solana Anchor program but adapted for the EVM ecosystem.

## Directory Structure

```
contracts/
├── src/
│   ├── EscrowAgent.sol          # Main escrow contract
│   └── IEscrowAgent.sol         # Interface with types and events
├── script/
│   ├── Deploy.s.sol             # Deployment script
│   └── DeployMockUSDC.s.sol     # Mock USDC for testing
├── test/
│   └── EscrowAgent.t.sol        # Foundry tests (18 passing)
├── lib/                         # Dependencies (OpenZeppelin, Forge Std)
├── broadcast/                   # Deployment artifacts
├── cache/                       # Foundry build cache
├── out/                         # Compiled contracts
├── foundry.toml                 # Foundry configuration
└── remappings.txt               # Import remappings
```

## Smart Contracts

### EscrowAgent.sol

The main contract that handles all escrow operations.

**Inheritance:**
- `IEscrowAgent` - Interface definitions
- `ReentrancyGuard` - OpenZeppelin protection
- `Pausable` - Emergency pause functionality

**Key Features:**
- ERC-20 token custody (holds tokens directly, no vault pattern)
- Duplicate escrow prevention via unique keys
- Fee management (protocol + arbitrator fees)
- Dispute resolution system
- Provider auto-release after grace period
- Expiry mechanism with refunds

**State Variables:**

```solidity
// Protocol config
address public admin;
address public feeAuthority;
uint16 public protocolFeeBps;        // Default: 50 (0.5%)
uint16 public arbitratorFeeBps;      // Default: 100 (1.0%)
uint64 public minEscrowAmount;
uint64 public maxEscrowAmount;
uint64 public minGracePeriod;        // Default: 300 seconds (5 min)
uint64 public maxDeadlineSeconds;    // Default: 604800 (7 days)

// Escrow storage
uint256 public nextEscrowId;
mapping(uint256 => Escrow) private _escrows;
mapping(bytes32 => uint256) public escrowByKey;  // Prevents duplicates
```

**Main Functions:**

| Function | Caller | Description |
|----------|--------|-------------|
| `createEscrow()` | Client | Lock tokens with task and deadline |
| `acceptEscrow()` | Provider | Accept pending escrow |
| `submitProof()` | Provider | Submit proof of completion |
| `confirmCompletion()` | Client | Confirm and release to provider |
| `cancelEscrow()` | Client | Cancel before acceptance (full refund) |
| `raiseDispute()` | Client/Provider | Open dispute, freeze funds |
| `resolveDispute()` | Arbitrator | Rule on dispute (PayClient/PayProvider/Split) |
| `expireEscrow()` | Anyone | Expire after deadline + grace (refund client) |
| `providerRelease()` | Provider | Release funds after grace if client doesn't confirm |
| `updateConfig()` | Admin | Update protocol parameters |

### IEscrowAgent.sol

Interface defining the contract's types, enums, and events.

**Key Types:**

```solidity
enum EscrowStatus {
    AwaitingProvider,
    Active,
    ProofSubmitted,
    Completed,
    Disputed,
    Resolved,
    Expired,
    Cancelled
}

enum VerificationType {
    OnChain,           // 0 - Transaction hash verification
    OracleCallback,    // 1 - External oracle
    MultiSigConfirm,   // 2 - Client manual confirmation
    AutoRelease        // 3 - Timer-based
}

enum DisputeRuling {
    PayClient,         // Full refund to client
    PayProvider,       // Full amount to provider
    Split              // Custom split via bps
}

struct Escrow {
    uint256 escrowId;
    address client;
    address provider;
    address arbitrator;
    address tokenMint;
    uint256 amount;
    uint16 protocolFeeBps;
    EscrowStatus status;
    VerificationType verificationType;
    bytes32 taskHash;
    uint64 deadline;
    uint64 gracePeriod;
    uint64 createdAt;
    uint64 completedAt;
}
```

**Events:**

```solidity
event EscrowCreated(uint256 indexed escrowId, address client, address provider, uint256 amount);
event EscrowAccepted(uint256 indexed escrowId);
event EscrowProofSubmitted(uint256 indexed escrowId, bytes proofData);
event EscrowCompleted(uint256 indexed escrowId);
event EscrowCancelled(uint256 indexed escrowId);
event EscrowExpired(uint256 indexed escrowId);
event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, string reason);
event DisputeResolved(uint256 indexed escrowId, DisputeRuling ruling);
event ProtocolConfigUpdated();
```

## Architecture

### Token Flow

```
1. CREATE
   Client calls createEscrow()
   ↓
   SafeERC20.safeTransferFrom(client → contract)
   ↓
   Escrow created with status AwaitingProvider

2. COMPLETE
   Client calls confirmCompletion()
   ↓
   Calculate fees:
     protocolFee = amount * protocolFeeBps / 10000
     providerAmount = amount - protocolFee
   ↓
   SafeERC20.safeTransfer(provider ← contract)
   SafeERC20.safeTransfer(feeAuthority ← contract)
   ↓
   Status → Completed

3. DISPUTE
   Arbitrator calls resolveDispute()
   ↓
   Calculate split based on ruling
   ↓
   Transfer to client and/or provider
   ↓
   Status → Resolved
```

### State Machine

```
AwaitingProvider
  ├─ cancelEscrow() → Cancelled (refund client)
  ├─ expireEscrow() → Expired (refund client)
  └─ acceptEscrow() → Active
                        ├─ raiseDispute() → Disputed
                        ├─ expireEscrow() → Expired
                        └─ submitProof() → ProofSubmitted
                                              ├─ confirmCompletion() → Completed
                                              ├─ providerRelease() → Completed
                                              ├─ raiseDispute() → Disputed
                                              └─ expireEscrow() → Expired

Disputed → resolveDispute() → Resolved
```

### Duplicate Prevention

The contract prevents duplicate escrows using a unique key:

```solidity
bytes32 key = keccak256(abi.encodePacked(client, provider, taskHash));
require(escrowByKey[key] == 0, "Duplicate escrow");
```

This ensures a client can't create multiple identical escrows with the same provider for the same task.

## Deployment

### Prerequisites

- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- ETH on Base for gas fees
- Private key with funds
- Basescan API key (for verification)

### Environment Variables

Create `contracts/.env`:

```env
DEPLOYER_PRIVATE_KEY=0x...
ADMIN_ADDRESS=0x...         # Optional, defaults to deployer
FEE_AUTHORITY=0x...         # Optional, defaults to deployer
BASESCAN_API_KEY=...        # For contract verification
```

### Deploy to Base Sepolia (Testnet)

```bash
cd contracts

# Deploy EscrowAgent
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify

# Deploy MockUSDC (for testing)
forge script script/DeployMockUSDC.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast
```

### Deploy to Base Mainnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify
```

### Deployment Artifacts

After deployment, artifacts are saved in `broadcast/`:

```
broadcast/Deploy.s.sol/84532/
├── run-latest.json    # Latest deployment
└── run-*.json         # Historical runs
```

Extract deployed contract address from `run-latest.json`.

## Testing

### Run Tests

```bash
cd contracts

# Run all tests
forge test

# Verbose output
forge test -vv

# Very verbose (with stack traces)
forge test -vvv

# Run specific test
forge test --match-test testCreateEscrow
```

### Test Coverage

The test suite includes 18 passing tests covering:

| Category | Tests |
|----------|-------|
| **Setup** | Constructor, protocol config initialization |
| **Happy Path** | Create → Accept → Proof → Confirm |
| **Validation** | Self-escrow prevention, minimum amount, duplicates |
| **Cancellation** | Cancel before acceptance, revert after acceptance |
| **Expiry** | Expire after deadline + grace, premature expiry check |
| **Provider Release** | Auto-release after grace period |
| **Disputes** | Raise dispute, resolve with PayClient/PayProvider/Split |
| **Admin** | Update config, pause/unpause |
| **Events** | Event emission verification |

### Test Structure

```solidity
contract EscrowAgentTest is Test {
    EscrowAgent public escrowAgent;
    MockUSDC public usdc;
    
    address admin = makeAddr("admin");
    address feeWallet = makeAddr("feeWallet");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address arbitrator = makeAddr("arbitrator");
    
    function setUp() public {
        // Deploy contracts
        vm.prank(admin);
        escrowAgent = new EscrowAgent(...);
        
        // Mint USDC to client
        usdc.mint(client, 1_000_000e6);
    }
    
    function testCreateEscrow() public {
        // Test implementation
    }
}
```

## Configuration

### Protocol Parameters

Set in the constructor or via `updateConfig()`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `protocolFeeBps` | 50 (0.5%) | Fee taken on successful completion |
| `arbitratorFeeBps` | 100 (1.0%) | Fee for arbitrator on dispute |
| `minEscrowAmount` | 1000 | Minimum escrow amount (token units) |
| `maxEscrowAmount` | type(uint256).max | Maximum escrow amount |
| `minGracePeriod` | 300 (5 min) | Minimum grace period |
| `maxDeadlineSeconds` | 604800 (7 days) | Maximum deadline |

### Foundry Configuration

`foundry.toml`:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
base = "https://mainnet.base.org"
base_sepolia = "https://sepolia.base.org"
localhost = "http://localhost:8545"

[etherscan]
base = { key = "${BASESCAN_API_KEY}", url = "https://api.basescan.org/api" }
base_sepolia = { key = "${BASESCAN_API_KEY}", url = "https://api-sepolia.basescan.org/api" }
```

## Security Features

### ReentrancyGuard

All state-changing functions use `nonReentrant` modifier to prevent reentrancy attacks:

```solidity
function confirmCompletion(uint256 escrowId) external nonReentrant {
    // State changes before transfers
    escrow.status = EscrowStatus.Completed;
    escrow.completedAt = uint64(block.timestamp);
    
    // External calls after state changes
    SafeERC20.safeTransfer(...);
}
```

### SafeERC20

All token transfers use OpenZeppelin's SafeERC20:

```solidity
using SafeERC20 for IERC20;

IERC20(tokenMint).safeTransferFrom(client, address(this), amount);
```

### Pausable

Admin can pause the contract in emergencies:

```solidity
function pause() external onlyAdmin {
    _pause();
}

function createEscrow(...) external whenNotPaused {
    // ...
}
```

### Access Control

- `onlyAdmin`: Protocol configuration
- `onlyArbitrator`: Dispute resolution
- Caller checks on all state-changing functions

## Constants

### Token Addresses

Base Mainnet:
```solidity
USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

Base Sepolia:
```solidity
USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

### Chain IDs

```solidity
BASE_CHAIN_ID = 8453        // Mainnet
BASE_SEPOLIA_CHAIN_ID = 84532  // Testnet
```

## Integration with SDK

The SDK uses the contract ABI from `base-utils.ts`:

```typescript
import { ESCROW_AGENT_ABI } from "escrowagent-sdk";

const escrow = await publicClient.readContract({
  address: contractAddress,
  abi: ESCROW_AGENT_ABI,
  functionName: "getEscrow",
  args: [escrowId],
});
```

## Gas Optimization

- Packed storage for escrow struct
- Use of `uint64` for timestamps
- Cached state variables
- Minimal storage writes

## Known Limitations

1. **No batch operations** - Each escrow requires a separate transaction
2. **Fixed fee structure** - Fees can only be changed by admin for all escrows
3. **Single arbitrator per escrow** - Set at creation time
4. **ERC-20 only** - No native ETH support (wrap to WETH)

## Comparison with Solana

| Feature | Solana (Anchor) | Base (Solidity) |
|---------|-----------------|-----------------|
| **Custody** | PDA vault account | Contract holds tokens |
| **ID format** | Base58 PDA | Numeric counter |
| **Security** | Anchor constraints | ReentrancyGuard + SafeERC20 |
| **Pausable** | Flag on PDA | OpenZeppelin Pausable |
| **Token standard** | SPL Token | ERC-20 |
| **Gas costs** | ~0.001 SOL | ~$0.50-2 in ETH |

## Next Steps

- Read [SDK Guide](./SDK.md) to interact with the contract
- Check [Indexer Guide](./INDEXER.md) for event tracking
- See [DEPLOYMENT_BASE.md](../DEPLOYMENT_BASE.md) for full deployment guide

## Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Base Documentation](https://docs.base.org/)
- [Basescan](https://basescan.org/)

import { createHash } from "crypto";

// ──────────────────────────────────────────────────────
// Base Chain Constants
// ──────────────────────────────────────────────────────

/** Base Mainnet chain ID */
export const BASE_CHAIN_ID = 8453;

/** Base Sepolia (testnet) chain ID */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** USDC on Base Mainnet */
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** USDC on Base Sepolia */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** Default Base Mainnet RPC */
export const BASE_MAINNET_RPC = "https://mainnet.base.org";

/** Default Base Sepolia RPC */
export const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// ──────────────────────────────────────────────────────
// ABI for the EscrowAgent contract (generated from Foundry build)
// ──────────────────────────────────────────────────────

export const ESCROW_AGENT_ABI = [
  // ── Read functions ──
  {
    name: "getEscrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "client", type: "address" },
        { name: "provider", type: "address" },
        { name: "arbitrator", type: "address" },
        { name: "tokenAddress", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "protocolFeeBps", type: "uint16" },
        { name: "arbitratorFeeBps", type: "uint16" },
        { name: "taskHash", type: "bytes32" },
        { name: "verificationType", type: "uint8" },
        { name: "criteriaCount", type: "uint8" },
        { name: "createdAt", type: "uint64" },
        { name: "deadline", type: "uint64" },
        { name: "gracePeriod", type: "uint64" },
        { name: "status", type: "uint8" },
        { name: "proofType", type: "uint8" },
        { name: "proofSubmitted", type: "bool" },
        { name: "proofData", type: "bytes" },
        { name: "proofSubmittedAt", type: "uint64" },
        { name: "disputeRaisedBy", type: "address" },
      ],
    }],
  },
  {
    name: "getEscrowByKey",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "taskHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextEscrowId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "admin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "feeAuthority",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "protocolFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },

  // ── Write functions ──
  {
    name: "createEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "arbitrator", type: "address" },
      { name: "tokenAddress", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "gracePeriod", type: "uint64" },
      { name: "taskHash", type: "bytes32" },
      { name: "verificationType", type: "uint8" },
      { name: "criteriaCount", type: "uint8" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
  },
  {
    name: "acceptEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "submitProof",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      { name: "proofType", type: "uint8" },
      { name: "proofData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "confirmCompletion",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancelEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "expireEscrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "providerRelease",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "expireDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "raiseDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "resolveDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      {
        name: "ruling",
        type: "tuple",
        components: [
          { name: "rulingType", type: "uint8" },
          { name: "clientBps", type: "uint16" },
          { name: "providerBps", type: "uint16" },
        ],
      },
    ],
    outputs: [],
  },

  // ── Events ──
  {
    name: "EscrowCreated",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "tokenAddress", type: "address", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "taskHash", type: "bytes32", indexed: false },
      { name: "verificationType", type: "uint8", indexed: false },
    ],
  },
  {
    name: "EscrowAccepted",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "acceptedAt", type: "uint64", indexed: false },
    ],
  },
  {
    name: "EscrowProofSubmitted",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "proofType", type: "uint8", indexed: false },
      { name: "submittedAt", type: "uint64", indexed: false },
    ],
  },
  {
    name: "EscrowCompleted",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "amountPaid", type: "uint256", indexed: false },
      { name: "feeCollected", type: "uint256", indexed: false },
      { name: "completedAt", type: "uint64", indexed: false },
    ],
  },
  {
    name: "EscrowCancelled",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "cancelledAt", type: "uint64", indexed: false },
    ],
  },
  {
    name: "EscrowExpired",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "expiredAt", type: "uint64", indexed: false },
      { name: "refundAmount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "DisputeRaised",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "raisedBy", type: "address", indexed: true },
      { name: "raisedAt", type: "uint64", indexed: false },
    ],
  },
  {
    name: "DisputeResolved",
    type: "event",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "arbitrator", type: "address", indexed: true },
      { name: "ruling", type: "uint8", indexed: false },
      { name: "resolvedAt", type: "uint64", indexed: false },
    ],
  },
] as const;

// ──────────────────────────────────────────────────────
// ERC-20 ABI (minimal — just approve + balanceOf)
// ──────────────────────────────────────────────────────

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

/** Hash a task description to a bytes32 (SHA-256). Same logic as Solana SDK. */
export function hashTaskBase(description: string): `0x${string}` {
  const hash = createHash("sha256").update(description).digest("hex");
  return `0x${hash}` as `0x${string}`;
}

/** Map VerificationType string to uint8 for the contract */
export function verificationTypeToUint8(vt: string): number {
  const map: Record<string, number> = {
    OnChain: 0,
    OracleCallback: 1,
    MultiSigConfirm: 2,
    AutoRelease: 3,
  };
  return map[vt] ?? 2;
}

/** Map uint8 to VerificationType string */
export function uint8ToVerificationType(n: number): string {
  const map: Record<number, string> = {
    0: "OnChain",
    1: "OracleCallback",
    2: "MultiSigConfirm",
    3: "AutoRelease",
  };
  return map[n] ?? "MultiSigConfirm";
}

/** Map ProofType string to uint8 for the contract */
export function proofTypeToUint8(pt: string): number {
  const map: Record<string, number> = {
    TransactionSignature: 0,
    OracleAttestation: 1,
    SignedConfirmation: 2,
  };
  return map[pt] ?? 0;
}

/** Map uint8 to ProofType string */
export function uint8ToProofType(n: number): string | null {
  const map: Record<number, string> = {
    0: "TransactionSignature",
    1: "OracleAttestation",
    2: "SignedConfirmation",
  };
  return map[n] ?? null;
}

/** Map EscrowStatus uint8 to string */
export function uint8ToEscrowStatus(n: number): string {
  const map: Record<number, string> = {
    0: "AwaitingProvider",
    1: "Active",
    2: "ProofSubmitted",
    3: "Completed",
    4: "Disputed",
    5: "Resolved",
    6: "Expired",
    7: "Cancelled",
  };
  return map[n] ?? "AwaitingProvider";
}

/** Map DisputeRuling type string to uint8 */
export function disputeRulingTypeToUint8(rt: string): number {
  const map: Record<string, number> = {
    PayClient: 0,
    PayProvider: 1,
    Split: 2,
  };
  return map[rt] ?? 0;
}

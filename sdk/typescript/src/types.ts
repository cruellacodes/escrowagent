import { PublicKey } from "@solana/web3.js";

// ──────────────────────────────────────────────────────
// Enums (mirrors on-chain enums)
// ──────────────────────────────────────────────────────

export type EscrowStatus =
  | "AwaitingProvider"
  | "Active"
  | "ProofSubmitted"
  | "Completed"
  | "Disputed"
  | "Resolved"
  | "Expired"
  | "Cancelled";

export type VerificationType =
  | "OnChain"
  | "OracleCallback"
  | "MultiSigConfirm"
  | "AutoRelease";

export type CriterionType =
  | "TransactionExecuted"
  | "TokenTransferred"
  | "PriceThreshold"
  | "TimeBound"
  | "Custom";

export type ProofType =
  | "TransactionSignature"
  | "OracleAttestation"
  | "SignedConfirmation";

export type DisputeRuling =
  | { type: "PayClient" }
  | { type: "PayProvider" }
  | { type: "Split"; clientBps: number; providerBps: number };

// ──────────────────────────────────────────────────────
// Create Escrow params
// ──────────────────────────────────────────────────────

export interface TaskCriterion {
  type: CriterionType;
  description: string;
  targetValue?: number;
}

export interface TaskDefinition {
  description: string;
  criteria: TaskCriterion[];
  metadata?: Record<string, unknown>;
}

export interface CreateEscrowParams {
  /** Provider (Agent B) public key */
  provider: string | PublicKey;
  /** Amount in smallest token unit (e.g., 50_000_000 for 50 USDC) */
  amount: number;
  /** SPL token mint address */
  tokenMint: string | PublicKey;
  /** Deadline as Date or unix timestamp (ms) */
  deadline: Date | number;
  /** Grace period in seconds (default: 300) */
  gracePeriod?: number;
  /** Task description and success criteria */
  task: TaskDefinition;
  /** How completion is verified */
  verification: VerificationType;
  /** Optional arbitrator public key */
  arbitrator?: string | PublicKey;
}

// ──────────────────────────────────────────────────────
// Submit Proof params
// ──────────────────────────────────────────────────────

export interface SubmitProofParams {
  type: ProofType;
  /** Proof data — tx signature, oracle attestation, etc. */
  data: string | Buffer;
}

// ──────────────────────────────────────────────────────
// Dispute params
// ──────────────────────────────────────────────────────

export interface RaiseDisputeParams {
  reason: string;
}

// ──────────────────────────────────────────────────────
// Query types
// ──────────────────────────────────────────────────────

export interface EscrowInfo {
  address: string;
  client: string;
  provider: string;
  arbitrator: string | null;
  tokenMint: string;
  amount: number;
  protocolFeeBps: number;
  status: EscrowStatus;
  verificationType: VerificationType;
  taskHash: string;
  deadline: Date;
  gracePeriod: number;
  createdAt: Date;
  proofType: ProofType | null;
  proofSubmittedAt: Date | null;
}

export interface AgentStats {
  address: string;
  totalEscrows: number;
  completedEscrows: number;
  disputedEscrows: number;
  expiredEscrows: number;
  totalVolume: number;
  successRate: number;
  avgCompletionTime: number;
  lastActive: Date | null;
}

export interface ListEscrowsFilter {
  status?: EscrowStatus;
  client?: string | PublicKey;
  provider?: string | PublicKey;
  limit?: number;
  offset?: number;
}

// ──────────────────────────────────────────────────────
// SDK Configuration
// ──────────────────────────────────────────────────────

export interface AgentVaultConfig {
  /** Solana RPC connection or URL */
  connection: any; // Connection from @solana/web3.js
  /** Wallet keypair or adapter */
  wallet: any;
  /** Optional indexer API URL for query methods */
  indexerUrl?: string;
  /** Program ID override (defaults to deployed address) */
  programId?: string | PublicKey;
  /** Protocol fee account (required for creating escrows) */
  protocolFeeAccount?: string | PublicKey;
}

export interface TransactionResult {
  signature: string;
  escrowAddress: string;
}

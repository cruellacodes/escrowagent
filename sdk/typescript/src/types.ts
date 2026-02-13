// ──────────────────────────────────────────────────────
// Enums (mirrors on-chain enums — shared across chains)
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

export type ChainType = "solana" | "base";

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
  /** Provider (Agent B) address */
  provider: string;
  /** Amount in smallest token unit (e.g., 50_000_000 for 50 USDC) */
  amount: number;
  /** Token address (SPL mint on Solana, ERC-20 address on Base) */
  tokenMint: string;
  /** Deadline as Date or unix timestamp (ms) */
  deadline: Date | number;
  /** Grace period in seconds (default: 300) */
  gracePeriod?: number;
  /** Task description and success criteria */
  task: TaskDefinition;
  /** How completion is verified */
  verification: VerificationType;
  /** Optional arbitrator address for dispute resolution */
  arbitrator?: string;
}

// ──────────────────────────────────────────────────────
// Submit Proof params
// ──────────────────────────────────────────────────────

export interface SubmitProofParams {
  type: ProofType;
  /** Proof data — tx signature, oracle attestation, etc. */
  data: string | Uint8Array;
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
  client?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}

// ──────────────────────────────────────────────────────
// Chain-agnostic interface (implemented by Solana + Base)
// ──────────────────────────────────────────────────────

export interface IEscrowClient {
  createEscrow(params: CreateEscrowParams): Promise<TransactionResult>;
  acceptEscrow(escrowAddress: string): Promise<string>;
  submitProof(escrowAddress: string, proof: SubmitProofParams): Promise<string>;
  confirmCompletion(escrowAddress: string): Promise<string>;
  cancelEscrow(escrowAddress: string): Promise<string>;
  raiseDispute(escrowAddress: string, params: { reason: string }): Promise<string>;
  resolveDispute(escrowAddress: string, ruling: DisputeRuling): Promise<string>;
  expireEscrow(escrowAddress: string): Promise<string>;
  providerRelease(escrowAddress: string): Promise<string>;
  expireDispute(escrowAddress: string): Promise<string>;
  getEscrow(escrowAddress: string): Promise<EscrowInfo>;
  listEscrows(filter?: ListEscrowsFilter): Promise<EscrowInfo[]>;
  getAgentStats(agentAddress: string): Promise<AgentStats>;
}

// ──────────────────────────────────────────────────────
// SDK Configuration (multi-chain)
// ──────────────────────────────────────────────────────

export interface AgentVaultConfig {
  /** Which chain to use — "solana" (default) or "base" */
  chain?: ChainType;
  /** Optional indexer API URL for query methods */
  indexerUrl?: string;

  // ── Solana-specific config ──
  /** Solana RPC connection or URL string */
  connection?: any;
  /** Solana wallet keypair */
  wallet?: any;
  /** Solana program ID override */
  programId?: string;
  /** Solana protocol fee account */
  protocolFeeAccount?: string;

  // ── Base-specific config ──
  /** Base RPC URL */
  rpcUrl?: string;
  /** Base wallet private key (hex) */
  privateKey?: string;
  /** Base contract address */
  contractAddress?: string;
  /** Base chain ID (8453 = mainnet, 84532 = sepolia) */
  chainId?: number;
}

export interface TransactionResult {
  signature: string;
  escrowAddress: string;
}

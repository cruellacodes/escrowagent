// ── Multi-chain client (factory) ──
export { AgentVault } from "./client";

// ── Chain-specific clients (for advanced use) ──
export { SolanaEscrowClient } from "./solana";
export { BaseEscrowClient } from "./base";

// ── Types ──
export type {
  AgentVaultConfig,
  CreateEscrowParams,
  SubmitProofParams,
  RaiseDisputeParams,
  EscrowInfo,
  AgentStats,
  ListEscrowsFilter,
  TransactionResult,
  DisputeRuling,
  EscrowStatus,
  VerificationType,
  CriterionType,
  ProofType,
  TaskDefinition,
  TaskCriterion,
  ChainType,
  IEscrowClient,
} from "./types";

// ── Solana utilities ──
export {
  PROGRAM_ID,
  USDC_MINT,
  USDC_DEVNET_MINT,
  createComputeBudgetInstructions,
  deriveEscrowPDA,
  deriveVaultPDA,
  deriveVaultAuthorityPDA,
  deriveProtocolConfigPDA,
  hashTask,
  toPublicKey,
  formatTokenAmount,
  parseTokenAmount,
  sleep,
} from "./utils";

// ── Base utilities ──
export {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  USDC_BASE,
  USDC_BASE_SEPOLIA,
  BASE_MAINNET_RPC,
  BASE_SEPOLIA_RPC,
  ESCROW_AGENT_ABI,
  hashTaskBase,
} from "./base-utils";

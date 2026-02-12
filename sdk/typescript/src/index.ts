export { AgentVault } from "./client";

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
} from "./types";

export {
  PROGRAM_ID,
  USDC_MINT,
  USDC_DEVNET_MINT,
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

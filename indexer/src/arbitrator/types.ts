// ──────────────────────────────────────────────────────
// Arbitrator Agent Types
// ──────────────────────────────────────────────────────

export interface DisputeCase {
  /** Escrow ID (numeric for Base, PDA address for Solana) */
  escrowId: string;
  /** Which chain the escrow lives on */
  chain: "solana" | "base";
  /** Client (payer) address */
  client: string;
  /** Provider (worker) address */
  provider: string;
  /** Escrowed amount in smallest token unit */
  amount: number;
  /** Token address (SPL mint or ERC-20) */
  tokenMint: string;
  /** Human-readable task description */
  taskDescription: string;
  /** Success criteria defined at escrow creation */
  taskCriteria: { type: string; description: string }[];
  /** All proof submissions from the provider */
  proofs: { type: string; data: string; submittedAt: string }[];
  /** Why the dispute was raised */
  disputeReason: string;
  /** Who raised it — "client" or "provider" */
  disputeRaisedBy: string;
  /** Escrow deadline */
  deadline: string;
  /** When the escrow was created */
  createdAt: string;
}

export interface AiRuling {
  /** The ruling decision */
  ruling: "PayClient" | "PayProvider" | "Split";
  /** How confident the AI is (0-1) */
  confidence: number;
  /** Human-readable explanation of why */
  reasoning: string;
  /** Basis points for client (only for Split) */
  clientBps: number;
  /** Basis points for provider (only for Split) */
  providerBps: number;
}

export interface ArbitratorConfig {
  /** Whether the arbitrator agent is enabled */
  enabled: boolean;
  /** Base wallet private key (hex) */
  privateKeyBase: string;
  /** Solana wallet keypair (JSON array) */
  privateKeySolana: string;
  /** Anthropic API key */
  anthropicApiKey: string;
  /** Whether to auto-submit rulings on-chain */
  autoResolve: boolean;
  /** Minimum confidence to auto-resolve (0-1) */
  minConfidence: number;
  /** Base contract address */
  baseContractAddress: string;
  /** Base RPC URL */
  baseRpcUrl: string;
  /** Base chain ID */
  baseChainId: number;
  /** Solana RPC URL */
  solanaRpcUrl: string;
  /** Solana program ID */
  solanaProgramId: string;
  /** Polling interval in ms */
  pollIntervalMs: number;
}

export function loadArbitratorConfig(): ArbitratorConfig {
  return {
    enabled: process.env.ARBITRATOR_ENABLED === "true",
    privateKeyBase: process.env.ARBITRATOR_PRIVATE_KEY_BASE || "",
    privateKeySolana: process.env.ARBITRATOR_PRIVATE_KEY_SOLANA || "",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    autoResolve: process.env.ARBITRATOR_AUTO_RESOLVE !== "false",
    minConfidence: parseFloat(process.env.ARBITRATOR_MIN_CONFIDENCE || "0.7"),
    baseContractAddress: process.env.BASE_CONTRACT_ADDRESS || "",
    baseRpcUrl: process.env.BASE_RPC_URL || "",
    baseChainId: parseInt(process.env.BASE_CHAIN_ID || "84532", 10),
    solanaRpcUrl: process.env.SOLANA_RPC_URL || "",
    solanaProgramId: process.env.PROGRAM_ID || "8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py",
    pollIntervalMs: parseInt(process.env.ARBITRATOR_POLL_INTERVAL || "30000", 10),
  };
}

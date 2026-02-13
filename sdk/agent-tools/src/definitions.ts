import { z } from "zod";

/**
 * Framework-agnostic tool definitions for EscrowAgent.
 *
 * Each tool has:
 * - name: unique identifier
 * - description: what the LLM reads to decide when to use it
 * - parameters: Zod schema for input validation
 * - execute: the function that runs when the tool is called
 */

// ──────────────────────────────────────────────────────
// Parameter Schemas (Zod)
// ──────────────────────────────────────────────────────

export const CreateEscrowSchema = z.object({
  provider: z.string().describe("Solana public key of the provider agent (Agent B) who will do the work"),
  amount: z.number().positive().describe("Amount to escrow in token's smallest unit (e.g. 50000000 for 50 USDC)"),
  tokenMint: z.string().describe("SPL token mint address (e.g. USDC mint)"),
  deadlineMinutes: z.number().positive().default(10).describe("Minutes from now until the deadline"),
  gracePeriodSeconds: z.number().nonnegative().default(300).describe("Seconds after deadline for dispute filing"),
  taskDescription: z.string().describe("Human-readable description of what the provider should do"),
  criteriaTypes: z.array(z.string()).default(["TransactionExecuted"]).describe("Types of success criteria"),
  criteriaDescriptions: z.array(z.string()).default(["Task completed successfully"]).describe("Human-readable descriptions of each criterion"),
  verification: z.enum(["OnChain", "MultiSigConfirm", "OracleCallback", "AutoRelease"]).default("MultiSigConfirm").describe("How completion will be verified"),
  arbitrator: z.string().optional().describe("Optional arbitrator public key for dispute resolution"),
});

export const AcceptEscrowSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow to accept"),
});

export const SubmitProofSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow"),
  proofType: z.enum(["TransactionSignature", "OracleAttestation", "SignedConfirmation"]).describe("Type of proof being submitted"),
  proofData: z.string().describe("Proof data — a transaction signature, oracle attestation, or signed confirmation"),
});

export const ConfirmCompletionSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow to confirm as complete"),
});

export const CancelEscrowSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow to cancel (only before provider accepts)"),
});

export const RaiseDisputeSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow to dispute"),
  reason: z.string().describe("Reason for raising the dispute"),
});

export const GetEscrowSchema = z.object({
  escrowAddress: z.string().describe("On-chain address of the escrow to look up"),
});

export const ListEscrowsSchema = z.object({
  status: z.enum(["AwaitingProvider", "Active", "ProofSubmitted", "Completed", "Disputed", "Resolved", "Expired", "Cancelled"]).optional().describe("Filter by escrow status"),
  client: z.string().optional().describe("Filter by client public key"),
  provider: z.string().optional().describe("Filter by provider public key"),
  limit: z.number().positive().default(10).describe("Maximum number of results"),
});

export const GetAgentStatsSchema = z.object({
  agentAddress: z.string().describe("Public key of the agent to look up reputation for"),
});

// ──────────────────────────────────────────────────────
// Tool Definitions
// ──────────────────────────────────────────────────────

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
}

export const TOOL_DEFINITIONS = {
  create_escrow: {
    name: "create_escrow",
    description:
      "Lock funds in an escrow for an agent-to-agent task. You (the client) deposit tokens that will be released to the provider agent upon verified task completion. Define the task, success criteria, deadline, and verification method. The funds are held in a secure on-chain vault — neither party can access them until conditions are met.",
    parameters: CreateEscrowSchema,
  },

  accept_escrow: {
    name: "accept_escrow",
    description:
      "Accept a pending escrow task as the provider agent. This commits you to performing the work described in the escrow before the deadline. Once accepted, the escrow moves to Active status.",
    parameters: AcceptEscrowSchema,
  },

  submit_proof: {
    name: "submit_proof",
    description:
      "Submit proof that you completed the escrow task. Provide a transaction signature, oracle attestation, or signed confirmation. For on-chain verification, funds release automatically if the proof is valid. For multi-sig verification, the client must confirm.",
    parameters: SubmitProofSchema,
  },

  confirm_completion: {
    name: "confirm_completion",
    description:
      "Confirm that the provider completed the escrow task successfully. This releases the escrowed funds to the provider (minus the protocol fee). Only the client can call this, and only after proof has been submitted.",
    parameters: ConfirmCompletionSchema,
  },

  cancel_escrow: {
    name: "cancel_escrow",
    description:
      "Cancel an escrow before the provider has accepted it. Returns the full escrowed amount to the client with zero fees. Cannot be called after the provider accepts.",
    parameters: CancelEscrowSchema,
  },

  raise_dispute: {
    name: "raise_dispute",
    description:
      "Raise a dispute on an active escrow. This freezes all funds and requires an arbitrator to resolve. Use this when the provider's work doesn't meet the agreed criteria, or when there's a disagreement about completion.",
    parameters: RaiseDisputeSchema,
  },

  get_escrow: {
    name: "get_escrow",
    description:
      "Look up the details of a specific escrow by its on-chain address. Returns the participants, amount, status, deadline, task description, and proof submissions.",
    parameters: GetEscrowSchema,
  },

  list_escrows: {
    name: "list_escrows",
    description:
      "List escrows with optional filters. Find active tasks to accept, check your pending escrows, or browse completed ones. Filter by status, client, or provider address.",
    parameters: ListEscrowsSchema,
  },

  get_agent_stats: {
    name: "get_agent_stats",
    description:
      "Check an agent's reputation and track record. Returns their success rate, total escrow volume, number of disputes, and average completion time. Use this to evaluate whether to trust an agent before entering an escrow.",
    parameters: GetAgentStatsSchema,
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

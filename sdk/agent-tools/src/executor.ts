import { AgentVault, USDC_MINT } from "escrowagent-sdk";
import type { z } from "zod";
import type {
  CreateEscrowSchema,
  AcceptEscrowSchema,
  SubmitProofSchema,
  ConfirmCompletionSchema,
  CancelEscrowSchema,
  RaiseDisputeSchema,
  GetEscrowSchema,
  ListEscrowsSchema,
  GetAgentStatsSchema,
} from "./definitions";

/**
 * Tool executor — maps tool calls to EscrowAgent SDK methods.
 *
 * This is the bridge between AI tool calls and the actual Solana transactions.
 * Framework adapters (LangChain, Vercel AI, MCP) all route through here.
 */
export class ToolExecutor {
  constructor(private vault: AgentVault) {}

  async execute(
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    switch (toolName) {
      case "create_escrow":
        return this.createEscrow(args as z.infer<typeof CreateEscrowSchema>);
      case "accept_escrow":
        return this.acceptEscrow(args as z.infer<typeof AcceptEscrowSchema>);
      case "submit_proof":
        return this.submitProof(args as z.infer<typeof SubmitProofSchema>);
      case "confirm_completion":
        return this.confirmCompletion(args as z.infer<typeof ConfirmCompletionSchema>);
      case "cancel_escrow":
        return this.cancelEscrow(args as z.infer<typeof CancelEscrowSchema>);
      case "raise_dispute":
        return this.raiseDispute(args as z.infer<typeof RaiseDisputeSchema>);
      case "get_escrow":
        return this.getEscrow(args as z.infer<typeof GetEscrowSchema>);
      case "list_escrows":
        return this.listEscrows(args as z.infer<typeof ListEscrowsSchema>);
      case "get_agent_stats":
        return this.getAgentStats(args as z.infer<typeof GetAgentStatsSchema>);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  }

  private async createEscrow(args: z.infer<typeof CreateEscrowSchema>): Promise<string> {
    try {
      const criteria = args.criteriaTypes.map((type, i) => ({
        type: type as any,
        description: args.criteriaDescriptions[i] || "Criterion",
      }));

      const result = await this.vault.createEscrow({
        provider: args.provider,
        amount: args.amount,
        tokenMint: args.tokenMint,
        deadline: Date.now() + args.deadlineMinutes * 60 * 1000,
        gracePeriod: args.gracePeriodSeconds,
        task: {
          description: args.taskDescription,
          criteria,
        },
        verification: args.verification as any,
        arbitrator: args.arbitrator,
      });

      return JSON.stringify({
        success: true,
        escrowAddress: result.escrowAddress,
        transactionSignature: result.signature,
        amount: args.amount,
        deadline: `${args.deadlineMinutes} minutes from now`,
        message: `Escrow created successfully. ${args.amount} tokens locked. Provider ${args.provider.slice(0, 8)}... has ${args.deadlineMinutes} minutes to complete the task.`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async acceptEscrow(args: z.infer<typeof AcceptEscrowSchema>): Promise<string> {
    try {
      const sig = await this.vault.acceptEscrow(args.escrowAddress);
      return JSON.stringify({
        success: true,
        transactionSignature: sig,
        message: `Escrow ${args.escrowAddress.slice(0, 8)}... accepted. Task is now active — complete the work before the deadline.`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async submitProof(args: z.infer<typeof SubmitProofSchema>): Promise<string> {
    try {
      const sig = await this.vault.submitProof(args.escrowAddress, {
        type: args.proofType as any,
        data: args.proofData,
      });
      return JSON.stringify({
        success: true,
        transactionSignature: sig,
        message: `Proof submitted for escrow ${args.escrowAddress.slice(0, 8)}.... Awaiting verification.`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async confirmCompletion(args: z.infer<typeof ConfirmCompletionSchema>): Promise<string> {
    try {
      const sig = await this.vault.confirmCompletion(args.escrowAddress);
      return JSON.stringify({
        success: true,
        transactionSignature: sig,
        message: `Completion confirmed. Funds released to the provider for escrow ${args.escrowAddress.slice(0, 8)}...`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async cancelEscrow(args: z.infer<typeof CancelEscrowSchema>): Promise<string> {
    try {
      const sig = await this.vault.cancelEscrow(args.escrowAddress);
      return JSON.stringify({
        success: true,
        transactionSignature: sig,
        message: `Escrow ${args.escrowAddress.slice(0, 8)}... cancelled. Full refund returned.`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async raiseDispute(args: z.infer<typeof RaiseDisputeSchema>): Promise<string> {
    try {
      const sig = await this.vault.raiseDispute(args.escrowAddress, {
        reason: args.reason,
      });
      return JSON.stringify({
        success: true,
        transactionSignature: sig,
        message: `Dispute raised on escrow ${args.escrowAddress.slice(0, 8)}.... Funds are frozen. An arbitrator will resolve this.`,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async getEscrow(args: z.infer<typeof GetEscrowSchema>): Promise<string> {
    try {
      const escrow = await this.vault.getEscrow(args.escrowAddress);
      return JSON.stringify({
        success: true,
        escrow: {
          address: escrow.address,
          client: escrow.client,
          provider: escrow.provider,
          amount: escrow.amount,
          status: escrow.status,
          verificationType: escrow.verificationType,
          deadline: escrow.deadline,
          createdAt: escrow.createdAt,
          proofType: escrow.proofType,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async listEscrows(args: z.infer<typeof ListEscrowsSchema>): Promise<string> {
    try {
      const escrows = await this.vault.listEscrows({
        status: args.status as any,
        client: args.client,
        provider: args.provider,
        limit: args.limit,
      });
      return JSON.stringify({
        success: true,
        count: escrows.length,
        escrows: escrows.map((e) => ({
          address: e.address,
          client: e.client,
          provider: e.provider,
          amount: e.amount,
          status: e.status,
          deadline: e.deadline,
        })),
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  private async getAgentStats(args: z.infer<typeof GetAgentStatsSchema>): Promise<string> {
    try {
      const stats = await this.vault.getAgentStats(args.agentAddress);
      return JSON.stringify({
        success: true,
        stats: {
          address: stats.address,
          totalEscrows: stats.totalEscrows,
          completedEscrows: stats.completedEscrows,
          disputedEscrows: stats.disputedEscrows,
          successRate: `${stats.successRate}%`,
          totalVolume: stats.totalVolume,
          avgCompletionTime: `${stats.avgCompletionTime}s`,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  }
}

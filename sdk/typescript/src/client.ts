/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  AgentVaultConfig,
  CreateEscrowParams,
  SubmitProofParams,
  EscrowInfo,
  AgentStats,
  ListEscrowsFilter,
  TransactionResult,
  DisputeRuling,
  IEscrowClient,
} from "./types";
import { SolanaEscrowClient } from "./solana";
import { BaseEscrowClient } from "./base";

/**
 * EscrowAgent SDK Client — Multi-chain factory
 *
 * Creates the appropriate chain-specific client (Solana or Base) based on config.
 * All downstream consumers use the same interface regardless of chain.
 *
 * @example Solana
 * ```ts
 * const vault = new AgentVault({
 *   chain: "solana",
 *   connection: new Connection("https://api.mainnet-beta.solana.com"),
 *   wallet: agentKeypair,
 * });
 * ```
 *
 * @example Base
 * ```ts
 * const vault = new AgentVault({
 *   chain: "base",
 *   privateKey: "0x...",
 *   contractAddress: "0x...",
 *   rpcUrl: "https://mainnet.base.org",
 * });
 * ```
 */
export class AgentVault implements IEscrowClient {
  private client: IEscrowClient;

  constructor(config: AgentVaultConfig) {
    const chain = config.chain ?? "solana";

    if (chain === "base") {
      this.client = new BaseEscrowClient(config);
    } else {
      this.client = new SolanaEscrowClient(config);
    }
  }

  // ── Delegate all methods to the chain-specific client ──

  createEscrow(params: CreateEscrowParams): Promise<TransactionResult> {
    return this.client.createEscrow(params);
  }

  acceptEscrow(escrowAddress: string): Promise<string> {
    return this.client.acceptEscrow(escrowAddress);
  }

  submitProof(escrowAddress: string, proof: SubmitProofParams): Promise<string> {
    return this.client.submitProof(escrowAddress, proof);
  }

  confirmCompletion(escrowAddress: string): Promise<string> {
    return this.client.confirmCompletion(escrowAddress);
  }

  cancelEscrow(escrowAddress: string): Promise<string> {
    return this.client.cancelEscrow(escrowAddress);
  }

  raiseDispute(escrowAddress: string, params: { reason: string }): Promise<string> {
    return this.client.raiseDispute(escrowAddress, params);
  }

  resolveDispute(escrowAddress: string, ruling: DisputeRuling): Promise<string> {
    return this.client.resolveDispute(escrowAddress, ruling);
  }

  expireEscrow(escrowAddress: string): Promise<string> {
    return this.client.expireEscrow(escrowAddress);
  }

  providerRelease(escrowAddress: string): Promise<string> {
    return this.client.providerRelease(escrowAddress);
  }

  expireDispute(escrowAddress: string): Promise<string> {
    return this.client.expireDispute(escrowAddress);
  }

  getEscrow(escrowAddress: string): Promise<EscrowInfo> {
    return this.client.getEscrow(escrowAddress);
  }

  listEscrows(filter?: ListEscrowsFilter): Promise<EscrowInfo[]> {
    return this.client.listEscrows(filter);
  }

  getAgentStats(agentAddress: string): Promise<AgentStats> {
    return this.client.getAgentStats(agentAddress);
  }
}

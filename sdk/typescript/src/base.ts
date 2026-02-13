import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Address,
  type Hex,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

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
  VerificationType,
  ProofType,
  EscrowStatus,
} from "./types";
import {
  ESCROW_AGENT_ABI,
  ERC20_ABI,
  BASE_MAINNET_RPC,
  BASE_SEPOLIA_RPC,
  hashTaskBase,
  verificationTypeToUint8,
  uint8ToVerificationType,
  proofTypeToUint8,
  uint8ToProofType,
  uint8ToEscrowStatus,
  disputeRulingTypeToUint8,
} from "./base-utils";

/**
 * Base (EVM) implementation of the EscrowAgent client.
 * Uses viem to interact with the Solidity contract on Base L2.
 */
export class BaseEscrowClient implements IEscrowClient {
  private contractAddress: Address;
  private account: ReturnType<typeof privateKeyToAccount>;
  private indexerUrl: string | null;
  private chain: Chain;
  private rpcUrl: string;

  constructor(config: AgentVaultConfig) {
    if (!config.privateKey) throw new Error("privateKey is required for Base chain");
    if (!config.contractAddress) throw new Error("contractAddress is required for Base chain");

    this.account = privateKeyToAccount(config.privateKey as Hex);
    this.contractAddress = getAddress(config.contractAddress);
    this.indexerUrl = config.indexerUrl || null;

    const chainId = config.chainId ?? 8453;
    this.chain = chainId === 84532 ? baseSepolia : base;
    this.rpcUrl = config.rpcUrl ?? (chainId === 84532 ? BASE_SEPOLIA_RPC : BASE_MAINNET_RPC);
  }

  private get publicClient() {
    return createPublicClient({
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  private get walletClient() {
    return createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  // ──────────────────────────────────────────────────────
  // ESCROW LIFECYCLE
  // ──────────────────────────────────────────────────────

  async createEscrow(params: CreateEscrowParams): Promise<TransactionResult> {
    const provider = getAddress(params.provider);
    const tokenAddress = getAddress(params.tokenMint);
    const arbitrator = params.arbitrator
      ? getAddress(params.arbitrator)
      : "0x0000000000000000000000000000000000000000" as Address;

    const taskHash = hashTaskBase(
      JSON.stringify({
        description: params.task.description,
        criteria: params.task.criteria,
      })
    );

    const deadline =
      params.deadline instanceof Date
        ? Math.floor(params.deadline.getTime() / 1000)
        : Math.floor(params.deadline / 1000);

    const gracePeriod = params.gracePeriod ?? 300;

    // Ensure approval for token transfer
    const currentAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, this.contractAddress],
    });

    if ((currentAllowance as bigint) < BigInt(params.amount)) {
      const approveHash = await this.walletClient.writeContract({
        chain: this.chain,
        account: this.account,
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [this.contractAddress, BigInt(params.amount)],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    // Create escrow
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "createEscrow",
      args: [
        provider,
        arbitrator,
        tokenAddress,
        BigInt(params.amount),
        BigInt(deadline),
        BigInt(gracePeriod),
        taskHash as Hex,
        verificationTypeToUint8(params.verification),
        params.task.criteria.length,
      ],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    const nextId = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "nextEscrowId",
    }) as bigint;

    const escrowId = (nextId - 1n).toString();

    if (this.indexerUrl) {
      await this.storeTask(taskHash.slice(2), params.task);
    }

    return {
      signature: hash,
      escrowAddress: escrowId,
    };
  }

  async acceptEscrow(escrowAddress: string): Promise<string> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "acceptEscrow",
      args: [BigInt(escrowAddress)],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async submitProof(escrowAddress: string, proof: SubmitProofParams): Promise<string> {
    const proofData = typeof proof.data === "string"
      ? (`0x${Buffer.from(proof.data).toString("hex")}` as Hex)
      : (`0x${Buffer.from(proof.data).toString("hex")}` as Hex);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "submitProof",
      args: [BigInt(escrowAddress), proofTypeToUint8(proof.type), proofData],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async confirmCompletion(escrowAddress: string): Promise<string> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "confirmCompletion",
      args: [BigInt(escrowAddress)],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async cancelEscrow(escrowAddress: string): Promise<string> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "cancelEscrow",
      args: [BigInt(escrowAddress)],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ──────────────────────────────────────────────────────
  // DISPUTE HANDLING
  // ──────────────────────────────────────────────────────

  async raiseDispute(escrowAddress: string, params: { reason: string }): Promise<string> {
    if (this.indexerUrl) {
      await fetch(`${this.indexerUrl}/disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escrowAddress,
          raisedBy: this.account.address,
          reason: params.reason,
        }),
      });
    }

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "raiseDispute",
      args: [BigInt(escrowAddress)],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async resolveDispute(escrowAddress: string, ruling: DisputeRuling): Promise<string> {
    const rulingArg = {
      rulingType: disputeRulingTypeToUint8(ruling.type),
      clientBps: ruling.type === "Split" ? ruling.clientBps : 0,
      providerBps: ruling.type === "Split" ? ruling.providerBps : 0,
    };

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      account: this.account,
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "resolveDispute",
      args: [BigInt(escrowAddress), rulingArg],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ──────────────────────────────────────────────────────
  // QUERIES
  // ──────────────────────────────────────────────────────

  async getEscrow(escrowAddress: string): Promise<EscrowInfo> {
    if (this.indexerUrl) {
      const res = await fetch(`${this.indexerUrl}/escrows/${escrowAddress}`);
      return res.json() as Promise<EscrowInfo>;
    }

    const data = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "getEscrow",
      args: [BigInt(escrowAddress)],
    }) as any;

    return this.parseEscrowData(escrowAddress, data);
  }

  async listEscrows(filter?: ListEscrowsFilter): Promise<EscrowInfo[]> {
    if (this.indexerUrl) {
      const params = new URLSearchParams();
      if (filter?.status) params.set("status", filter.status);
      if (filter?.client) params.set("client", filter.client);
      if (filter?.provider) params.set("provider", filter.provider);
      if (filter?.limit) params.set("limit", filter.limit.toString());
      if (filter?.offset) params.set("offset", filter.offset.toString());
      params.set("chain", "base");

      const res = await fetch(`${this.indexerUrl}/escrows?${params.toString()}`);
      return res.json() as Promise<EscrowInfo[]>;
    }

    const nextId = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ESCROW_AGENT_ABI,
      functionName: "nextEscrowId",
    }) as bigint;

    const limit = filter?.limit ?? 10;
    const escrows: EscrowInfo[] = [];

    for (let i = Number(nextId) - 1; i >= 1 && escrows.length < limit; i--) {
      try {
        const data = await this.publicClient.readContract({
          address: this.contractAddress,
          abi: ESCROW_AGENT_ABI,
          functionName: "getEscrow",
          args: [BigInt(i)],
        }) as any;

        const escrow = this.parseEscrowData(i.toString(), data);

        if (filter?.status && escrow.status !== filter.status) continue;
        if (filter?.client && escrow.client.toLowerCase() !== filter.client.toLowerCase()) continue;
        if (filter?.provider && escrow.provider.toLowerCase() !== filter.provider.toLowerCase()) continue;

        escrows.push(escrow);
      } catch {
        continue;
      }
    }

    return escrows;
  }

  async getAgentStats(agentAddress: string): Promise<AgentStats> {
    if (!this.indexerUrl) {
      throw new Error("Indexer URL required for agent stats");
    }
    const res = await fetch(`${this.indexerUrl}/agents/${agentAddress}/stats`);
    return res.json() as Promise<AgentStats>;
  }

  // ──────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ──────────────────────────────────────────────────────

  private parseEscrowData(id: string, data: any): EscrowInfo {
    return {
      address: id,
      client: data.client,
      provider: data.provider,
      arbitrator: data.arbitrator === "0x0000000000000000000000000000000000000000"
        ? null
        : data.arbitrator,
      tokenMint: data.tokenAddress,
      amount: Number(data.amount),
      protocolFeeBps: Number(data.protocolFeeBps),
      status: uint8ToEscrowStatus(Number(data.status)) as EscrowStatus,
      verificationType: uint8ToVerificationType(Number(data.verificationType)) as VerificationType,
      taskHash: typeof data.taskHash === "string" ? data.taskHash.slice(2) : data.taskHash,
      deadline: new Date(Number(data.deadline) * 1000),
      gracePeriod: Number(data.gracePeriod),
      createdAt: new Date(Number(data.createdAt) * 1000),
      proofType: data.proofSubmitted
        ? uint8ToProofType(Number(data.proofType)) as ProofType
        : null,
      proofSubmittedAt: data.proofSubmittedAt && Number(data.proofSubmittedAt) > 0
        ? new Date(Number(data.proofSubmittedAt) * 1000)
        : null,
    };
  }

  private async storeTask(
    taskHash: string,
    task: { description: string; criteria: any[]; metadata?: any }
  ): Promise<void> {
    try {
      await fetch(`${this.indexerUrl}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskHash,
          description: task.description,
          criteria: task.criteria,
          metadata: task.metadata,
        }),
      });
    } catch (e) {
      console.warn("Failed to store task off-chain:", e);
    }
  }
}

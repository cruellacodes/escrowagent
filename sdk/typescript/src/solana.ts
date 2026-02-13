import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

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
  EscrowStatus,
  IEscrowClient,
} from "./types";
import {
  PROGRAM_ID,
  deriveEscrowPDA,
  deriveVaultPDA,
  deriveVaultAuthorityPDA,
  hashTask,
  toPublicKey,
} from "./utils";

/**
 * Solana implementation of the EscrowAgent client.
 * Uses Anchor + @solana/web3.js to interact with the on-chain program.
 */
export class SolanaEscrowClient implements IEscrowClient {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;
  private program: any = null;
  private indexerUrl: string | null;
  private protocolFeeAccount: PublicKey;

  constructor(config: AgentVaultConfig) {
    this.connection =
      typeof config.connection === "string"
        ? new Connection(config.connection)
        : config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId
      ? toPublicKey(config.programId)
      : PROGRAM_ID;
    this.indexerUrl = config.indexerUrl || null;
    this.protocolFeeAccount = config.protocolFeeAccount
      ? toPublicKey(config.protocolFeeAccount)
      : PublicKey.default;
  }

  // ──────────────────────────────────────────────────────
  // ESCROW LIFECYCLE
  // ──────────────────────────────────────────────────────

  async createEscrow(params: CreateEscrowParams): Promise<TransactionResult> {
    const provider = toPublicKey(params.provider);
    const tokenMint = toPublicKey(params.tokenMint);
    const arbitrator = params.arbitrator
      ? toPublicKey(params.arbitrator)
      : PublicKey.default;

    const taskHash = hashTask(
      JSON.stringify({
        description: params.task.description,
        criteria: params.task.criteria,
      })
    );

    const [escrowPDA] = deriveEscrowPDA(
      this.wallet.publicKey,
      provider,
      taskHash,
      this.programId
    );
    const [vaultPDA] = deriveVaultPDA(escrowPDA, this.programId);
    const [vaultAuthorityPDA] = deriveVaultAuthorityPDA(
      escrowPDA,
      this.programId
    );

    const clientTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      this.wallet.publicKey
    );

    const deadline =
      params.deadline instanceof Date
        ? Math.floor(params.deadline.getTime() / 1000)
        : Math.floor(params.deadline / 1000);

    const gracePeriod = params.gracePeriod ?? 300;

    const verificationTypeMap: Record<string, object> = {
      OnChain: { onChain: {} },
      OracleCallback: { oracleCallback: {} },
      MultiSigConfirm: { multiSigConfirm: {} },
      AutoRelease: { autoRelease: {} },
    };

    const program = await this.getProgram();

    const tx = await program.methods
      .createEscrow(
        new anchor.BN(params.amount),
        new anchor.BN(deadline),
        new anchor.BN(gracePeriod),
        Array.from(taskHash),
        verificationTypeMap[params.verification],
        params.task.criteria.length
      )
      .accounts({
        client: this.wallet.publicKey,
        provider,
        arbitrator,
        escrow: escrowPDA,
        tokenMint,
        clientTokenAccount,
        escrowVault: vaultPDA,
        escrowVaultAuthority: vaultAuthorityPDA,
        protocolFeeAccount: this.protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([this.wallet])
      .rpc();

    if (this.indexerUrl) {
      await this.storeTask(taskHash.toString("hex"), params.task);
    }

    return {
      signature: tx,
      escrowAddress: escrowPDA.toBase58(),
    };
  }

  async acceptEscrow(escrowAddress: string): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const program = await this.getProgram();

    return program.methods
      .acceptEscrow()
      .accounts({
        provider: this.wallet.publicKey,
        escrow: escrowPubkey,
      })
      .signers([this.wallet])
      .rpc();
  }

  async submitProof(
    escrowAddress: string,
    proof: SubmitProofParams
  ): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const [vaultPDA] = deriveVaultPDA(escrowPubkey, this.programId);
    const [vaultAuthorityPDA] = deriveVaultAuthorityPDA(
      escrowPubkey,
      this.programId
    );

    const program = await this.getProgram();
    const escrowData = await program.account.escrow.fetch(escrowPubkey);

    const providerTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      this.wallet.publicKey
    );

    const proofBuffer = Buffer.alloc(64);
    const rawData =
      typeof proof.data === "string" ? Buffer.from(proof.data) : Buffer.from(proof.data);
    rawData.copy(proofBuffer, 0, 0, Math.min(rawData.length, 64));

    const proofTypeMap: Record<string, object> = {
      TransactionSignature: { transactionSignature: {} },
      OracleAttestation: { oracleAttestation: {} },
      SignedConfirmation: { signedConfirmation: {} },
    };

    return program.methods
      .submitProof(proofTypeMap[proof.type], Array.from(proofBuffer))
      .accounts({
        provider: this.wallet.publicKey,
        escrow: escrowPubkey,
        escrowVault: vaultPDA,
        escrowVaultAuthority: vaultAuthorityPDA,
        providerTokenAccount,
        protocolFeeAccount: this.protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();
  }

  async confirmCompletion(escrowAddress: string): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const [vaultPDA] = deriveVaultPDA(escrowPubkey, this.programId);
    const [vaultAuthorityPDA] = deriveVaultAuthorityPDA(
      escrowPubkey,
      this.programId
    );

    const program = await this.getProgram();
    const escrowData = await program.account.escrow.fetch(escrowPubkey);

    const providerTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      escrowData.provider
    );

    return program.methods
      .confirmCompletion()
      .accounts({
        client: this.wallet.publicKey,
        escrow: escrowPubkey,
        escrowVault: vaultPDA,
        escrowVaultAuthority: vaultAuthorityPDA,
        providerTokenAccount,
        protocolFeeAccount: this.protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();
  }

  async cancelEscrow(escrowAddress: string): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const [vaultPDA] = deriveVaultPDA(escrowPubkey, this.programId);
    const [vaultAuthorityPDA] = deriveVaultAuthorityPDA(
      escrowPubkey,
      this.programId
    );

    const program = await this.getProgram();
    const escrowData = await program.account.escrow.fetch(escrowPubkey);

    const clientTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      this.wallet.publicKey
    );

    return program.methods
      .cancelEscrow()
      .accounts({
        client: this.wallet.publicKey,
        escrow: escrowPubkey,
        escrowVault: vaultPDA,
        escrowVaultAuthority: vaultAuthorityPDA,
        clientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();
  }

  // ──────────────────────────────────────────────────────
  // DISPUTE HANDLING
  // ──────────────────────────────────────────────────────

  async raiseDispute(
    escrowAddress: string,
    params: { reason: string }
  ): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const program = await this.getProgram();

    if (this.indexerUrl) {
      await fetch(`${this.indexerUrl}/disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escrowAddress,
          raisedBy: this.wallet.publicKey.toBase58(),
          reason: params.reason,
        }),
      });
    }

    return program.methods
      .raiseDispute()
      .accounts({
        raiser: this.wallet.publicKey,
        escrow: escrowPubkey,
      })
      .signers([this.wallet])
      .rpc();
  }

  async resolveDispute(
    escrowAddress: string,
    ruling: DisputeRuling
  ): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const [vaultPDA] = deriveVaultPDA(escrowPubkey, this.programId);
    const [vaultAuthorityPDA] = deriveVaultAuthorityPDA(
      escrowPubkey,
      this.programId
    );

    const program = await this.getProgram();
    const escrowData = await program.account.escrow.fetch(escrowPubkey);

    const clientTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      escrowData.client
    );
    const providerTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      escrowData.provider
    );
    const arbitratorTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      this.wallet.publicKey
    );

    let rulingArg: object;
    switch (ruling.type) {
      case "PayClient":
        rulingArg = { payClient: {} };
        break;
      case "PayProvider":
        rulingArg = { payProvider: {} };
        break;
      case "Split":
        rulingArg = {
          split: {
            clientBps: ruling.clientBps,
            providerBps: ruling.providerBps,
          },
        };
        break;
    }

    return program.methods
      .resolveDispute(rulingArg)
      .accounts({
        arbitrator: this.wallet.publicKey,
        escrow: escrowPubkey,
        escrowVault: vaultPDA,
        escrowVaultAuthority: vaultAuthorityPDA,
        clientTokenAccount,
        providerTokenAccount,
        arbitratorTokenAccount,
        protocolFeeAccount: this.protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();
  }

  // ──────────────────────────────────────────────────────
  // QUERIES
  // ──────────────────────────────────────────────────────

  async getEscrow(escrowAddress: string): Promise<EscrowInfo> {
    if (this.indexerUrl) {
      const res = await fetch(`${this.indexerUrl}/escrows/${escrowAddress}`);
      return res.json() as Promise<EscrowInfo>;
    }

    const program = await this.getProgram();
    const escrowPubkey = new PublicKey(escrowAddress);
    const data = await program.account.escrow.fetch(escrowPubkey);
    return this.parseEscrowAccount(escrowAddress, data);
  }

  async listEscrows(filter?: ListEscrowsFilter): Promise<EscrowInfo[]> {
    if (this.indexerUrl) {
      const params = new URLSearchParams();
      if (filter?.status) params.set("status", filter.status);
      if (filter?.client) params.set("client", filter.client);
      if (filter?.provider) params.set("provider", filter.provider);
      if (filter?.limit) params.set("limit", filter.limit.toString());
      if (filter?.offset) params.set("offset", filter.offset.toString());

      const res = await fetch(
        `${this.indexerUrl}/escrows?${params.toString()}`
      );
      return res.json() as Promise<EscrowInfo[]>;
    }

    const program = await this.getProgram();
    const accounts = await program.account.escrow.all();
    return accounts
      .map((a: any) =>
        this.parseEscrowAccount(a.publicKey.toBase58(), a.account)
      )
      .filter((e: EscrowInfo) => {
        if (filter?.status && e.status !== filter.status) return false;
        if (filter?.client && e.client !== filter.client) return false;
        if (filter?.provider && e.provider !== filter.provider) return false;
        return true;
      });
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

  private async getProgram(): Promise<any> {
    if (this.program) return this.program;

    const walletAdapter = {
      publicKey: this.wallet.publicKey,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        for (const tx of txs) {
          if (tx instanceof Transaction) {
            tx.sign(this.wallet);
          }
        }
        return txs;
      },
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (tx instanceof Transaction) {
          tx.sign(this.wallet);
        }
        return tx;
      },
    };
    const anchorProvider = new anchor.AnchorProvider(
      this.connection,
      walletAdapter,
      { commitment: "confirmed" }
    );

    const idl = await anchor.Program.fetchIdl(this.programId, anchorProvider);
    if (!idl) {
      throw new Error(
        `Could not fetch IDL for program ${this.programId.toBase58()}. ` +
          `Make sure the program is deployed and IDL is published.`
      );
    }

    this.program = new anchor.Program(idl, anchorProvider);
    return this.program;
  }

  private parseEscrowAccount(address: string, data: any): EscrowInfo {
    const statusMap: Record<string, EscrowStatus> = {
      awaitingProvider: "AwaitingProvider",
      active: "Active",
      proofSubmitted: "ProofSubmitted",
      completed: "Completed",
      disputed: "Disputed",
      resolved: "Resolved",
      expired: "Expired",
      cancelled: "Cancelled",
    };

    const statusKey = Object.keys(data.status)[0];

    return {
      address,
      client: data.client.toBase58(),
      provider: data.provider.toBase58(),
      arbitrator:
        data.arbitrator.toBase58() === PublicKey.default.toBase58()
          ? null
          : data.arbitrator.toBase58(),
      tokenMint: data.tokenMint.toBase58(),
      amount: data.amount.toNumber(),
      protocolFeeBps: data.protocolFeeBps,
      status: statusMap[statusKey] || statusKey,
      verificationType: Object.keys(data.verificationType)[0] as any,
      taskHash: Buffer.from(data.taskHash).toString("hex"),
      deadline: new Date(data.deadline.toNumber() * 1000),
      gracePeriod: data.gracePeriod.toNumber(),
      createdAt: new Date(data.createdAt.toNumber() * 1000),
      proofType: data.proofType
        ? (Object.keys(data.proofType)[0] as any)
        : null,
      proofSubmittedAt: data.proofSubmittedAt
        ? new Date(data.proofSubmittedAt.toNumber() * 1000)
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

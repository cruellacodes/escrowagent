import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

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
 * AgentVault SDK Client
 *
 * High-level interface for interacting with the AgentVault escrow protocol.
 * Abstracts away Solana complexity — agents just call methods.
 *
 * @example
 * ```ts
 * const vault = new AgentVault({
 *   connection: new Connection("https://api.mainnet-beta.solana.com"),
 *   wallet: agentKeypair,
 * });
 *
 * const escrow = await vault.createEscrow({
 *   provider: "AgentBpublickey...",
 *   amount: 50_000_000,
 *   tokenMint: USDC_MINT,
 *   deadline: Date.now() + 600_000,
 *   task: { description: "Swap 10 USDC to SOL", criteria: [...] },
 *   verification: "MultiSigConfirm",
 * });
 * ```
 */
export class AgentVault {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;
  private program: anchor.Program | null = null;
  private indexerUrl: string | null;
  private protocolFeeAccount: PublicKey | null;

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
      : null;
  }

  // ──────────────────────────────────────────────────────
  // ESCROW LIFECYCLE
  // ──────────────────────────────────────────────────────

  /**
   * Create a new escrow and deposit funds.
   * You are the client (Agent A). Specify the provider, amount, and task.
   */
  async createEscrow(params: CreateEscrowParams): Promise<TransactionResult> {
    const provider = toPublicKey(params.provider);
    const tokenMint = toPublicKey(params.tokenMint);
    const arbitrator = params.arbitrator
      ? toPublicKey(params.arbitrator)
      : PublicKey.default;

    // Hash the task description
    const taskHash = hashTask(
      JSON.stringify({
        description: params.task.description,
        criteria: params.task.criteria,
      })
    );

    // Derive PDAs
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

    // Get token accounts
    const clientTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      this.wallet.publicKey
    );

    // Calculate deadline
    const deadline =
      params.deadline instanceof Date
        ? Math.floor(params.deadline.getTime() / 1000)
        : Math.floor(params.deadline / 1000);

    const gracePeriod = params.gracePeriod ?? 300;

    // Convert verification type to Anchor enum format
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

    // If indexer is configured, store the task off-chain
    if (this.indexerUrl) {
      await this.storeTask(taskHash.toString("hex"), params.task);
    }

    return {
      signature: tx,
      escrowAddress: escrowPDA.toBase58(),
    };
  }

  /**
   * Accept an escrow as the provider (Agent B).
   */
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

  /**
   * Submit proof of task completion as the provider.
   */
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

    // Fetch the escrow to get token mint
    const program = await this.getProgram();
    const escrowData = await program.account.escrow.fetch(escrowPubkey);

    const providerTokenAccount = await getAssociatedTokenAddress(
      escrowData.tokenMint,
      this.wallet.publicKey
    );

    // Convert proof data to 64-byte buffer
    const proofBuffer = Buffer.alloc(64);
    const rawData =
      typeof proof.data === "string" ? Buffer.from(proof.data) : proof.data;
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

  /**
   * Confirm task completion as the client (MultiSig verification).
   * Releases funds to the provider.
   */
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

  /**
   * Cancel an escrow before provider accepts.
   * Full refund, no fee.
   */
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

  /**
   * Raise a dispute on an escrow. Either client or provider can call this.
   */
  async raiseDispute(
    escrowAddress: string,
    params: { reason: string }
  ): Promise<string> {
    const escrowPubkey = new PublicKey(escrowAddress);
    const program = await this.getProgram();

    // Store dispute reason off-chain
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

  /**
   * Resolve a dispute as the arbitrator.
   */
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

    // Convert ruling to Anchor format
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
  // QUERIES (via indexer API)
  // ──────────────────────────────────────────────────────

  /**
   * Get details of a single escrow.
   * Uses on-chain data or indexer API if configured.
   */
  async getEscrow(escrowAddress: string): Promise<EscrowInfo> {
    if (this.indexerUrl) {
      const res = await fetch(`${this.indexerUrl}/escrows/${escrowAddress}`);
      return res.json() as Promise<EscrowInfo>;
    }

    // Fallback: read directly from chain
    const program = await this.getProgram();
    const escrowPubkey = new PublicKey(escrowAddress);
    const data = await program.account.escrow.fetch(escrowPubkey);
    return this.parseEscrowAccount(escrowAddress, data);
  }

  /**
   * List escrows with optional filters.
   */
  async listEscrows(filter?: ListEscrowsFilter): Promise<EscrowInfo[]> {
    if (this.indexerUrl) {
      const params = new URLSearchParams();
      if (filter?.status) params.set("status", filter.status);
      if (filter?.client)
        params.set("client", toPublicKey(filter.client).toBase58());
      if (filter?.provider)
        params.set("provider", toPublicKey(filter.provider).toBase58());
      if (filter?.limit) params.set("limit", filter.limit.toString());
      if (filter?.offset) params.set("offset", filter.offset.toString());

      const res = await fetch(
        `${this.indexerUrl}/escrows?${params.toString()}`
      );
      return res.json() as Promise<EscrowInfo[]>;
    }

    // Fallback: fetch all from chain (expensive, not recommended for production)
    const program = await this.getProgram();
    const accounts = await program.account.escrow.all();
    return accounts
      .map((a: any) =>
        this.parseEscrowAccount(a.publicKey.toBase58(), a.account)
      )
      .filter((e: EscrowInfo) => {
        if (filter?.status && e.status !== filter.status) return false;
        if (filter?.client && e.client !== toPublicKey(filter.client).toBase58())
          return false;
        if (
          filter?.provider &&
          e.provider !== toPublicKey(filter.provider).toBase58()
        )
          return false;
        return true;
      });
  }

  /**
   * Get reputation stats for an agent.
   */
  async getAgentStats(agentAddress: string): Promise<AgentStats> {
    if (!this.indexerUrl) {
      throw new Error("Indexer URL required for agent stats");
    }
    const res = await fetch(`${this.indexerUrl}/agents/${agentAddress}/stats`);
    return res.json() as Promise<AgentStats>;
  }

  // ──────────────────────────────────────────────────────
  // EVENT LISTENERS
  // ──────────────────────────────────────────────────────

  /**
   * Subscribe to updates on a specific escrow.
   */
  onEscrowUpdate(
    escrowAddress: string,
    callback: (escrow: EscrowInfo) => void
  ): number {
    const escrowPubkey = new PublicKey(escrowAddress);
    return this.connection.onAccountChange(escrowPubkey, async (accountInfo) => {
      try {
        const program = await this.getProgram();
        const decoded = program.coder.accounts.decode(
          "escrow",
          accountInfo.data
        );
        callback(this.parseEscrowAccount(escrowAddress, decoded));
      } catch (e) {
        console.error("Failed to decode escrow update:", e);
      }
    });
  }

  /**
   * Listen for new escrows targeting this wallet as provider.
   */
  onNewEscrow(
    providerKey: PublicKey,
    callback: (escrow: EscrowInfo) => void
  ): number {
    // Subscribe to program log events
    return this.connection.onLogs(this.programId, async (logs) => {
      // Check if this is an EscrowCreated event
      const createdLog = logs.logs.find((l) =>
        l.includes("EscrowCreated")
      );
      if (!createdLog) return;

      // Parse and check if this escrow targets our provider
      // In production, you'd parse the event data properly
      try {
        const program = await this.getProgram();
        // Simplified: the real implementation would parse event data
        callback({
          address: "",
          client: "",
          provider: providerKey.toBase58(),
          arbitrator: null,
          tokenMint: "",
          amount: 0,
          protocolFeeBps: 50,
          status: "AwaitingProvider",
          verificationType: "MultiSigConfirm",
          taskHash: "",
          deadline: new Date(),
          gracePeriod: 300,
          createdAt: new Date(),
          proofType: null,
          proofSubmittedAt: null,
        });
      } catch (e) {
        console.error("Failed to parse new escrow event:", e);
      }
    });
  }

  /**
   * Remove an event listener.
   */
  async removeListener(subscriptionId: number): Promise<void> {
    await this.connection.removeAccountChangeListener(subscriptionId);
  }

  // ──────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ──────────────────────────────────────────────────────

  private async getProgram(): Promise<anchor.Program> {
    if (this.program) return this.program;

    // In production, load IDL from chain or bundled JSON
    // For now, we create a minimal provider
    const anchorProvider = new anchor.AnchorProvider(
      this.connection,
      {
        publicKey: this.wallet.publicKey,
        signAllTransactions: async (txs: Transaction[]) => {
          txs.forEach((tx) => tx.sign(this.wallet));
          return txs;
        },
        signTransaction: async (tx: Transaction) => {
          tx.sign(this.wallet);
          return tx;
        },
      },
      { commitment: "confirmed" }
    );

    // Load IDL — in a real deployment, this would be fetched from chain
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

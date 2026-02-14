import * as db from "../db";
import { analyzeDispute } from "./analyzer";
import { resolveOnBase } from "./resolver-base";
import { resolveOnSolana } from "./resolver-solana";
import { loadArbitratorConfig, type ArbitratorConfig } from "./types";

// ──────────────────────────────────────────────────────
// AI Arbitrator Agent
//
// Polls for disputed escrows assigned to this agent's wallet,
// analyzes evidence with Claude, and submits rulings on-chain.
// ──────────────────────────────────────────────────────

export class ArbitratorAgent {
  private config: ArbitratorConfig;
  private arbitratorAddressBase: string = "";
  private arbitratorAddressSolana: string = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = new Set<string>(); // Prevent duplicate processing

  constructor() {
    this.config = loadArbitratorConfig();
  }

  start(): void {
    if (!this.config.enabled) {
      console.log("[Arbitrator] Disabled (ARBITRATOR_ENABLED != true)");
      return;
    }

    if (!this.config.anthropicApiKey) {
      console.error("[Arbitrator] ANTHROPIC_API_KEY not set — cannot start");
      return;
    }

    // Derive wallet addresses for matching
    this.deriveAddresses();

    console.log("[Arbitrator] Starting AI arbitrator agent");
    console.log(`[Arbitrator] Base wallet: ${this.arbitratorAddressBase || "not configured"}`);
    console.log(`[Arbitrator] Auto-resolve: ${this.config.autoResolve}`);
    console.log(`[Arbitrator] Min confidence: ${this.config.minConfidence}`);
    console.log(`[Arbitrator] Poll interval: ${this.config.pollIntervalMs}ms`);

    // Initial poll
    this.poll();

    // Start polling loop
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[Arbitrator] Stopped");
  }

  private deriveAddresses(): void {
    // Base address from private key
    if (this.config.privateKeyBase) {
      try {
        const { privateKeyToAccount } = require("viem/accounts");
        const account = privateKeyToAccount(this.config.privateKeyBase as `0x${string}`);
        this.arbitratorAddressBase = account.address.toLowerCase();
      } catch (e) {
        console.warn("[Arbitrator] Could not derive Base address:", e);
      }
    }

    // Solana address from keypair
    if (this.config.privateKeySolana) {
      try {
        const { Keypair } = require("@solana/web3.js");
        const bytes = JSON.parse(this.config.privateKeySolana);
        const kp = Keypair.fromSecretKey(Uint8Array.from(bytes));
        this.arbitratorAddressSolana = kp.publicKey.toBase58();
      } catch (e) {
        console.warn("[Arbitrator] Could not derive Solana address:", e);
      }
    }
  }

  private async poll(): Promise<void> {
    try {
      // Find disputed escrows assigned to this arbitrator
      const result = await db.query(
        `SELECT e.*, t.description as task_description, t.criteria as task_criteria
         FROM escrows e
         LEFT JOIN tasks t ON e.task_hash = t.task_hash
         WHERE e.status = 'Disputed'
         AND (
           LOWER(e.arbitrator_address) = $1
           OR e.arbitrator_address = $2
         )
         ORDER BY e.updated_at ASC`,
        [this.arbitratorAddressBase, this.arbitratorAddressSolana]
      );

      for (const escrow of result.rows) {
        const key = `${escrow.chain}:${escrow.escrow_address}`;
        if (this.processing.has(key)) continue;

        // Check if already resolved by AI
        const existing = await db.query(
          `SELECT * FROM disputes WHERE escrow_address = $1 AND ai_ruling IS NOT NULL`,
          [escrow.escrow_address]
        );
        if (existing.rows.length > 0) continue;

        this.processing.add(key);
        try {
          await this.handleDispute(escrow);
        } catch (err) {
          console.error(`[Arbitrator] Error handling dispute ${key}:`, err);
        } finally {
          this.processing.delete(key);
        }
      }
    } catch (err) {
      console.error("[Arbitrator] Poll error:", err);
    }
  }

  private async handleDispute(escrow: any): Promise<void> {
    const escrowId = escrow.escrow_address;
    const chain = escrow.chain || "solana";

    console.log(`[Arbitrator] Processing dispute for escrow ${escrowId} on ${chain}`);

    // Gather evidence
    const proofs = await db.query(
      `SELECT * FROM proofs WHERE escrow_address = $1 ORDER BY submitted_at ASC`,
      [escrowId]
    );

    const disputes = await db.query(
      `SELECT * FROM disputes WHERE escrow_address = $1 ORDER BY raised_at DESC LIMIT 1`,
      [escrowId]
    );

    const disputeReason = disputes.rows[0]?.reason || "No reason provided";

    const disputeCase = {
      escrowId,
      chain: chain as "solana" | "base",
      client: escrow.client_address,
      provider: escrow.provider_address,
      amount: parseInt(escrow.amount, 10),
      tokenMint: escrow.token_mint,
      taskDescription: escrow.task_description || "No description available",
      taskCriteria: escrow.task_criteria || [],
      proofs: proofs.rows.map((p: any) => ({
        type: p.proof_type,
        data: p.proof_data,
        submittedAt: p.submitted_at?.toISOString() || "",
      })),
      disputeReason,
      disputeRaisedBy: disputes.rows[0]?.raised_by || escrow.client_address,
      deadline: escrow.deadline?.toISOString() || "",
      createdAt: escrow.created_at?.toISOString() || "",
    };

    // Analyze with Claude
    console.log(`[Arbitrator] Analyzing dispute with Claude...`);
    const { ruling, prompt, rawResponse } = await analyzeDispute(
      this.config.anthropicApiKey,
      disputeCase
    );

    console.log(`[Arbitrator] AI ruling: ${ruling.ruling} (confidence: ${ruling.confidence})`);
    console.log(`[Arbitrator] Reasoning: ${ruling.reasoning}`);

    // Store AI analysis in database
    await db.query(
      `UPDATE disputes SET
        ai_ruling = $1,
        ai_confidence = $2,
        ai_reasoning = $3,
        ai_prompt = $4,
        ai_response = $5
      WHERE escrow_address = $6
      AND resolved_at IS NULL`,
      [ruling.ruling, ruling.confidence, ruling.reasoning, prompt, rawResponse, escrowId]
    );

    // Check if we should auto-resolve
    if (!this.config.autoResolve) {
      console.log(`[Arbitrator] Auto-resolve disabled. Ruling logged for manual review.`);
      return;
    }

    if (ruling.confidence < this.config.minConfidence) {
      console.log(
        `[Arbitrator] Confidence ${ruling.confidence} below threshold ${this.config.minConfidence}. ` +
        `Ruling logged for manual review.`
      );
      return;
    }

    // Submit on-chain
    let txHash: string;
    try {
      if (chain === "base") {
        txHash = await resolveOnBase(this.config, escrowId, ruling);
      } else {
        txHash = await resolveOnSolana(this.config, escrowId, ruling, {
          client: escrow.client_address,
          provider: escrow.provider_address,
          tokenMint: escrow.token_mint,
          escrowVault: escrow.escrow_vault || "",
        });
      }

      // Update dispute record with resolution tx
      await db.query(
        `UPDATE disputes SET
          resolved_on_chain = true,
          resolution_tx = $1,
          ruling = $2,
          resolved_at = NOW()
        WHERE escrow_address = $3
        AND resolved_at IS NULL`,
        [txHash, ruling.ruling, escrowId]
      );

      console.log(`[Arbitrator] Dispute resolved on-chain: ${txHash}`);
    } catch (err) {
      console.error(`[Arbitrator] Failed to submit on-chain ruling:`, err);
      // The AI analysis is still saved — can be manually submitted later
    }
  }
}

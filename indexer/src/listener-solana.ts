import * as path from "path";
import * as fs from "fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import * as db from "./db";

// ──────────────────────────────────────────────────────
// Event Listener — watches for EscrowAgent program events
// ──────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py"
);

// Load IDL from bundled file (copied from Anchor build output)
const IDL_PATH = path.resolve(__dirname, "../escrowagent-idl.json");
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
const coder = new BorshCoder(idl);
const eventParser = new EventParser(
  new PublicKey(idl.address),
  coder
);

export class EventListener {
  private connection: Connection;
  private subscriptionId: number | null = null;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  /**
   * Start listening for program events via log subscription.
   * Parses Anchor events and updates the database.
   */
  start(): void {
    console.log(`[Listener] Subscribing to program: ${PROGRAM_ID.toBase58()}`);

    this.subscriptionId = this.connection.onLogs(
      PROGRAM_ID,
      async (logInfo) => {
        const { logs, signature } = logInfo;

        try {
          await this.processLogs(logs, signature);
        } catch (err) {
          console.error(`[Listener] Error processing tx ${signature}:`, err);
        }
      },
      "confirmed"
    );

    console.log("[Listener] Subscription active");
  }

  /**
   * Stop listening.
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      console.log("[Listener] Subscription removed");
    }
  }

  /**
   * Parse logs using Anchor EventParser and dispatch to handlers.
   */
  private async processLogs(
    logs: string[],
    txSignature: string
  ): Promise<void> {
    const events = eventParser.parseLogs(logs);

    for (const event of events) {
      try {
        switch (event.name) {
          case "EscrowCreated":
            await this.handleEscrowCreated(event.data, txSignature);
            break;
          case "EscrowAccepted":
            await this.handleStatusUpdate(event.data, txSignature, "Active");
            break;
          case "EscrowProofSubmitted":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "ProofSubmitted"
            );
            break;
          case "EscrowCompleted":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "Completed"
            );
            break;
          case "EscrowCancelled":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "Cancelled"
            );
            break;
          case "EscrowExpired":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "Expired"
            );
            break;
          case "DisputeRaised":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "Disputed"
            );
            break;
          case "DisputeResolved":
            await this.handleStatusUpdate(
              event.data,
              txSignature,
              "Resolved"
            );
            break;
          default:
            console.log(
              `[Event] Unhandled event ${(event as { name: string }).name} in tx ${txSignature}`
            );
        }
      } catch (err) {
        console.error(
          `[Listener] Error handling ${event.name} in tx ${txSignature}:`,
          err
        );
      }
    }
  }

  /**
   * Handle EscrowCreated: fetch escrow account for full data, upsert to DB.
   */
  private async handleEscrowCreated(
    data: Record<string, unknown>,
    txSignature: string
  ): Promise<void> {
    const escrowAddress = (data.escrow as { toBase58: () => string }).toBase58();
    const clientAddress = (data.client as { toBase58: () => string }).toBase58();
    const providerAddress = (
      data.provider as { toBase58: () => string }
    ).toBase58();
    const amount = Number(String(data.amount));
    const tokenMint = (data.tokenMint as { toBase58: () => string })?.toBase58() 
      || (data.token_mint as { toBase58: () => string })?.toBase58()
      || String(data.tokenMint || data.token_mint);
    const deadline = Number(String(data.deadline));
    const taskHashBytes = (data.taskHash || data.task_hash) as number[];
    const verificationType = (data.verificationType || data.verification_type) as Record<string, unknown>;

    const taskHash = Buffer.from(taskHashBytes).toString("hex");
    const verificationTypeStr = extractVerificationType(verificationType);

    // Fetch escrow account for arbitrator, grace_period, protocol_fee_bps
    let arbitratorAddress: string | undefined;
    let gracePeriod = 300;
    let protocolFeeBps = 50;

    try {
      const accountInfo = await this.connection.getAccountInfo(
        new PublicKey(escrowAddress)
      );
      if (accountInfo?.data) {
        const escrowAccount = coder.accounts.decode(
          "Escrow",
          accountInfo.data
        ) as Record<string, unknown>;
        arbitratorAddress = escrowAccount.arbitrator
          ? (escrowAccount.arbitrator as { toBase58: () => string }).toBase58()
          : undefined;
        gracePeriod = Number(String(escrowAccount.gracePeriod ?? escrowAccount.grace_period ?? 300));
        protocolFeeBps = Number(escrowAccount.protocolFeeBps ?? escrowAccount.protocol_fee_bps ?? 50);
      }
    } catch (err) {
      console.warn(
        `[Handler] Could not fetch escrow account ${escrowAddress}, using defaults:`,
        err
      );
    }

    await db.upsertEscrow({
      escrow_address: escrowAddress,
      client_address: clientAddress,
      provider_address: providerAddress,
      arbitrator_address: arbitratorAddress,
      token_mint: tokenMint,
      amount,
      status: "AwaitingProvider",
      verification_type: verificationTypeStr,
      task_hash: taskHash,
      deadline: new Date(deadline * 1000),
      grace_period: gracePeriod,
      tx_signature: txSignature,
    });

    console.log(
      `[Handler] Upserted EscrowCreated: ${escrowAddress} (tx ${txSignature})`
    );
  }

  /**
   * Handle status update events: extract escrow address from event, update DB.
   */
  private async handleStatusUpdate(
    data: Record<string, unknown>,
    txSignature: string,
    newStatus: string
  ): Promise<void> {
    const escrowAddress = (data.escrow as { toBase58: () => string }).toBase58();

    const completedAtRaw = data.completed_at ?? data.completedAt ?? data.completed_at;
    const completedAt =
        newStatus === "Completed" && completedAtRaw
            ? new Date(Number(String(completedAtRaw)) * 1000)
            : undefined;

    await db.updateEscrowStatus(escrowAddress, newStatus, completedAt);

    if (newStatus === "Completed") {
        const amountPaid = data.amount_paid ?? data.amountPaid;
        const feeCollected = data.fee_collected ?? data.feeCollected;
        if (amountPaid) console.log(`[Handler] Completed: paid=${amountPaid}, fee=${feeCollected}`);
    }

    console.log(
      `[Handler] Updated escrow ${escrowAddress} to ${newStatus} (tx ${txSignature})`
    );
  }
}

function extractVerificationType(v: Record<string, unknown>): string {
  const keys = Object.keys(v).filter((k) => !k.startsWith("_"));
  if (keys.length === 0) return "OnChain";
  const variant = keys[0];
  const map: Record<string, string> = {
    onChain: "OnChain",
    oracleCallback: "OracleCallback",
    multiSigConfirm: "MultiSigConfirm",
    autoRelease: "AutoRelease",
  };
  return map[variant] ?? "OnChain";
}

/**
 * Alternative: Helius Webhook Listener
 *
 * Instead of WebSocket subscriptions, you can use Helius webhooks
 * for more reliable event delivery. Set up a webhook at:
 * https://docs.helius.dev/webhooks-and-websockets/webhooks
 *
 * The webhook handler would be a simple HTTP endpoint:
 *
 * ```ts
 * fastify.post("/webhook/helius", async (req, reply) => {
 *   const events = req.body as any[];
 *   for (const event of events) {
 *     await processHeliusEvent(event);
 *   }
 *   return reply.send({ ok: true });
 * });
 * ```
 */

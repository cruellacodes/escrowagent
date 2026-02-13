import {
  createPublicClient,
  http,
  webSocket,
  type PublicClient,
  type Log,
  parseAbiItem,
  decodeEventLog,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import * as db from "./db";

// ──────────────────────────────────────────────────────
// Base Event Listener — watches for EscrowAgent contract events on Base
// ──────────────────────────────────────────────────────

// Contract ABI events (for decoding)
const ESCROW_AGENT_EVENTS = [
  parseAbiItem("event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed provider, uint256 amount, address tokenAddress, uint64 deadline, bytes32 taskHash, uint8 verificationType)"),
  parseAbiItem("event EscrowAccepted(uint256 indexed escrowId, address indexed provider, uint64 acceptedAt)"),
  parseAbiItem("event EscrowProofSubmitted(uint256 indexed escrowId, address indexed provider, uint8 proofType, uint64 submittedAt)"),
  parseAbiItem("event EscrowCompleted(uint256 indexed escrowId, uint256 amountPaid, uint256 feeCollected, uint64 completedAt)"),
  parseAbiItem("event EscrowCancelled(uint256 indexed escrowId, address indexed client, uint64 cancelledAt)"),
  parseAbiItem("event EscrowExpired(uint256 indexed escrowId, uint64 expiredAt, uint256 refundAmount)"),
  parseAbiItem("event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, uint64 raisedAt)"),
  parseAbiItem("event DisputeResolved(uint256 indexed escrowId, address indexed arbitrator, uint8 ruling, uint64 resolvedAt)"),
] as const;

const VERIFICATION_TYPE_MAP: Record<number, string> = {
  0: "OnChain",
  1: "OracleCallback",
  2: "MultiSigConfirm",
  3: "AutoRelease",
};

export class BaseEventListener {
  private client: PublicClient;
  private contractAddress: `0x${string}`;
  private unwatch: (() => void) | null = null;

  constructor(rpcUrl: string, contractAddress: string, chainId: number = 8453) {
    const chain = chainId === 84532 ? baseSepolia : base;

    // Use WebSocket if available, otherwise HTTP polling
    const transport = rpcUrl.startsWith("wss://")
      ? webSocket(rpcUrl)
      : http(rpcUrl);

    this.client = createPublicClient({
      chain,
      transport,
    });

    this.contractAddress = contractAddress as `0x${string}`;
  }

  /**
   * Start listening for contract events.
   */
  start(): void {
    console.log(`[Base Listener] Watching contract: ${this.contractAddress}`);

    this.unwatch = this.client.watchContractEvent({
      address: this.contractAddress,
      abi: ESCROW_AGENT_EVENTS,
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            await this.processLog(log);
          } catch (err) {
            console.error(
              `[Base Listener] Error processing log in tx ${log.transactionHash}:`,
              err
            );
          }
        }
      },
      onError: (error) => {
        console.error("[Base Listener] Subscription error:", error);
      },
    });

    console.log("[Base Listener] Subscription active");
  }

  /**
   * Stop listening.
   */
  async stop(): Promise<void> {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
      console.log("[Base Listener] Subscription removed");
    }
  }

  /**
   * Process a single event log.
   */
  private async processLog(log: Log): Promise<void> {
    const txHash = log.transactionHash || "";
    const eventName = (log as any).eventName;

    switch (eventName) {
      case "EscrowCreated":
        await this.handleEscrowCreated(log as any, txHash);
        break;
      case "EscrowAccepted":
        await this.handleStatusUpdate(log as any, txHash, "Active");
        break;
      case "EscrowProofSubmitted":
        await this.handleStatusUpdate(log as any, txHash, "ProofSubmitted");
        break;
      case "EscrowCompleted":
        await this.handleStatusUpdate(log as any, txHash, "Completed");
        break;
      case "EscrowCancelled":
        await this.handleStatusUpdate(log as any, txHash, "Cancelled");
        break;
      case "EscrowExpired":
        await this.handleStatusUpdate(log as any, txHash, "Expired");
        break;
      case "DisputeRaised":
        await this.handleStatusUpdate(log as any, txHash, "Disputed");
        break;
      case "DisputeResolved":
        await this.handleStatusUpdate(log as any, txHash, "Resolved");
        break;
      default:
        console.log(`[Base Listener] Unhandled event: ${eventName}`);
    }
  }

  /**
   * Handle EscrowCreated event.
   */
  private async handleEscrowCreated(
    log: { args: any },
    txHash: string
  ): Promise<void> {
    const args = log.args;
    const escrowId = args.escrowId.toString();
    const verificationType = VERIFICATION_TYPE_MAP[Number(args.verificationType)] || "OnChain";

    await db.upsertEscrow({
      escrow_address: escrowId,
      client_address: args.client,
      provider_address: args.provider,
      token_mint: args.tokenAddress,
      amount: Number(args.amount),
      status: "AwaitingProvider",
      verification_type: verificationType,
      task_hash: args.taskHash.slice(2), // remove 0x prefix
      deadline: new Date(Number(args.deadline) * 1000),
      grace_period: 300, // Default; can be fetched from contract if needed
      tx_signature: txHash,
      chain: "base",
    });

    console.log(
      `[Base Handler] Upserted EscrowCreated: ${escrowId} (tx ${txHash})`
    );
  }

  /**
   * Handle status update events.
   */
  private async handleStatusUpdate(
    log: { args: any },
    txHash: string,
    newStatus: string
  ): Promise<void> {
    const escrowId = log.args.escrowId.toString();

    const completedAt =
      newStatus === "Completed" && log.args.completedAt
        ? new Date(Number(log.args.completedAt) * 1000)
        : undefined;

    await db.updateEscrowStatus(escrowId, newStatus, completedAt);

    console.log(
      `[Base Handler] Updated escrow ${escrowId} to ${newStatus} (tx ${txHash})`
    );
  }
}

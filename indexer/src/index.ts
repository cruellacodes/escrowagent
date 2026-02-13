import "dotenv/config";
import { buildApp } from "./api";
import { EventListener } from "./listener-solana";
import { BaseEventListener } from "./listener-base";
import { migrate } from "./db";

// ──────────────────────────────────────────────────────
// EscrowAgent Indexer — Entry Point
//
// Starts event listeners for both Solana and Base, plus the REST API.
// ──────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

// Solana config
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Base config
const BASE_RPC_URL =
  process.env.BASE_RPC_URL || "https://sepolia.base.org";
const BASE_CONTRACT_ADDRESS =
  process.env.BASE_CONTRACT_ADDRESS || "";
const BASE_CHAIN_ID = parseInt(process.env.BASE_CHAIN_ID || "84532", 10);

async function main() {
  // 1. Run database migrations
  try {
    await migrate();
  } catch (err) {
    console.warn(
      "[Indexer] Database migration skipped (DB may not be available):",
      (err as Error).message
    );
  }

  // 2. Start the Solana event listener
  const solanaListener = new EventListener(SOLANA_RPC_URL);
  solanaListener.start();

  // 3. Start the Base event listener (if contract is configured)
  let baseListener: BaseEventListener | null = null;
  if (BASE_CONTRACT_ADDRESS) {
    baseListener = new BaseEventListener(BASE_RPC_URL, BASE_CONTRACT_ADDRESS, BASE_CHAIN_ID);
    baseListener.start();
  } else {
    console.log("[Indexer] Base listener skipped (BASE_CONTRACT_ADDRESS not set)");
  }

  // 4. Start the REST API
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[Indexer] API server running on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error("[Indexer] Failed to start API server:", err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[Indexer] Shutting down...");
    await solanaListener.stop();
    if (baseListener) await baseListener.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Indexer] Fatal error:", err);
  process.exit(1);
});

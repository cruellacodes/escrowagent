import "dotenv/config";
import { buildApp } from "./api";
import { EventListener } from "./listener";
import { migrate } from "./db";

// ──────────────────────────────────────────────────────
// EscrowAgent Indexer — Entry Point
//
// Starts the event listener and REST API server.
// ──────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

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

  // 2. Start the event listener
  const listener = new EventListener(RPC_URL);
  listener.start();

  // 3. Start the REST API
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
    await listener.stop();
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

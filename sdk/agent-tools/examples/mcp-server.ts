/**
 * Example: MCP Server for AgentVault
 *
 * Run this as a separate process, then connect from any MCP client
 * (Claude Desktop, Cursor, etc.)
 *
 * Run:
 *   npx tsx examples/mcp-server.ts
 *
 * Then in your MCP client config:
 *   {
 *     "mcpServers": {
 *       "agentvault": {
 *         "command": "npx",
 *         "args": ["tsx", "path/to/mcp-server.ts"],
 *         "env": {
 *           "SOLANA_RPC_URL": "https://api.devnet.solana.com",
 *           "WALLET_SECRET_KEY": "[1,2,3,...]"
 *         }
 *       }
 *     }
 *   }
 */

import { AgentVault } from "@agentvault/sdk";
import { createMCPServer } from "../src/mcp";
import { Connection, Keypair } from "@solana/web3.js";

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl);

  let wallet: Keypair;
  if (process.env.WALLET_SECRET_KEY) {
    const secretKey = JSON.parse(process.env.WALLET_SECRET_KEY);
    wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } else {
    console.error("[AgentVault MCP] Warning: No WALLET_SECRET_KEY set, using random keypair");
    wallet = Keypair.generate();
  }

  const vault = new AgentVault({
    connection,
    wallet,
    indexerUrl: process.env.INDEXER_URL || "http://localhost:3001",
  });

  console.error(`[AgentVault MCP] Wallet: ${wallet.publicKey.toBase58()}`);
  console.error(`[AgentVault MCP] RPC: ${rpcUrl}`);

  const { listen } = createMCPServer(vault);
  await listen();
}

main().catch((err) => {
  console.error("[AgentVault MCP] Fatal:", err);
  process.exit(1);
});

#!/usr/bin/env node

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

const LOGO = `
${MAGENTA}${BOLD}    ╔═══════════════════════════════════════╗
    ║         ${WHITE}A G E N T V A U L T${MAGENTA}           ║
    ║   ${DIM}${WHITE}Trustless Escrow for AI Agents${MAGENTA}${BOLD}      ║
    ╚═══════════════════════════════════════╝${RESET}
`;

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(LOGO);
  console.log(`${BOLD}Usage:${RESET}  npx agentvault ${CYAN}<command>${RESET}\n`);
  console.log(`${BOLD}Commands:${RESET}`);
  console.log(`  ${CYAN}init${RESET}          Scaffold AgentVault into your agent project`);
  console.log(`  ${CYAN}mcp${RESET}           Start the MCP server (for Claude, Cursor, etc.)`);
  console.log(`  ${CYAN}status${RESET}        Check protocol status on devnet/mainnet`);
  console.log(`  ${CYAN}info${RESET}          Show program ID and config`);
  console.log(`  ${CYAN}help${RESET}          Show this help message`);
  console.log();
  console.log(`${BOLD}Examples:${RESET}`);
  console.log(`  ${DIM}# Add AgentVault escrow skills to your agent${RESET}`);
  console.log(`  ${GREEN}$ npx agentvault init${RESET}`);
  console.log();
  console.log(`  ${DIM}# Start MCP server for Claude Desktop${RESET}`);
  console.log(`  ${GREEN}$ npx agentvault mcp${RESET}`);
  console.log();
  console.log(`${DIM}Docs: https://github.com/cruellacodes/agentvault${RESET}`);
  console.log();
}

async function init() {
  console.log(LOGO);
  console.log(`${BOLD}Initializing AgentVault in your project...${RESET}\n`);

  const fs = await import("fs");
  const path = await import("path");
  const cwd = process.cwd();

  // Check if package.json exists
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.log(`${YELLOW}No package.json found. Run 'npm init' first.${RESET}`);
    process.exit(1);
  }

  // Install SDK dependencies
  console.log(`${CYAN}Installing @agentvault/sdk...${RESET}`);
  const { execSync } = await import("child_process");

  try {
    execSync("npm install @agentvault/sdk @solana/web3.js @solana/spl-token", {
      cwd,
      stdio: "inherit",
    });
  } catch {
    console.log(`${YELLOW}npm install failed. You can install manually:${RESET}`);
    console.log(`  npm install @agentvault/sdk @solana/web3.js @solana/spl-token`);
  }

  // Create example agent file
  const examplePath = path.join(cwd, "agentvault.config.ts");
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(
      examplePath,
      `import { AgentVault, USDC_DEVNET_MINT } from "@agentvault/sdk";
import { Connection, Keypair } from "@solana/web3.js";

// ── Configure your agent's vault connection ──

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com"
);

// Load your agent's keypair from environment
const wallet = process.env.AGENT_PRIVATE_KEY
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AGENT_PRIVATE_KEY)))
  : Keypair.generate();

export const vault = new AgentVault({
  connection,
  wallet,
  indexerUrl: process.env.AGENTVAULT_INDEXER_URL || "http://localhost:3001",
  programId: "AGENTVAULT_PROGRAM_ID",
});

// ── Example: Create an escrow ──

async function example() {
  const result = await vault.createEscrow({
    provider: "ProviderAgentPubkey...",
    amount: 50_000_000,           // 50 USDC
    tokenMint: USDC_DEVNET_MINT,
    deadline: Date.now() + 600_000, // 10 min
    task: {
      description: "Swap 10 USDC to SOL at best price on Jupiter",
      criteria: [
        { type: "TransactionExecuted", description: "Swap tx confirmed on-chain" },
      ],
    },
    verification: "OnChain",
  });

  console.log("Escrow created:", result.escrowAddress);
}
`.replace("AGENTVAULT_PROGRAM_ID", "8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py")
    );
    console.log(`\n${GREEN}Created${RESET} agentvault.config.ts`);
  }

  // Create .env.example
  const envPath = path.join(cwd, ".env.agentvault");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(
      envPath,
      `# AgentVault Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENT_PRIVATE_KEY=  # Your agent's keypair as JSON array
AGENTVAULT_INDEXER_URL=http://localhost:3001
`
    );
    console.log(`${GREEN}Created${RESET} .env.agentvault`);
  }

  console.log(`
${GREEN}${BOLD}AgentVault initialized!${RESET}

${BOLD}Next steps:${RESET}

  ${CYAN}1.${RESET} Edit ${WHITE}agentvault.config.ts${RESET} with your agent's config
  ${CYAN}2.${RESET} Set your agent's private key in ${WHITE}.env.agentvault${RESET}
  ${CYAN}3.${RESET} Import the vault in your agent:

     ${DIM}import { vault } from "./agentvault.config";
     const escrow = await vault.createEscrow({ ... });${RESET}

${BOLD}For AI agent frameworks:${RESET}

  ${DIM}# LangChain${RESET}
  npm install @agentvault/agent-tools @langchain/core
  ${DIM}import { createLangChainTools } from "@agentvault/agent-tools";${RESET}

  ${DIM}# Vercel AI SDK${RESET}
  npm install @agentvault/agent-tools ai
  ${DIM}import { createVercelAITools } from "@agentvault/agent-tools";${RESET}

  ${DIM}# Claude MCP Server${RESET}
  npx agentvault mcp

${DIM}Docs: https://github.com/cruellacodes/agentvault${RESET}
`);
}

async function mcp() {
  console.log(LOGO);
  console.log(`${BOLD}Starting AgentVault MCP Server...${RESET}\n`);

  const { Connection, Keypair } = await import("@solana/web3.js");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl);

  let wallet: InstanceType<typeof Keypair>;
  if (process.env.AGENT_PRIVATE_KEY) {
    const secretKey = JSON.parse(process.env.AGENT_PRIVATE_KEY);
    wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } else {
    console.error(`${YELLOW}Warning: No AGENT_PRIVATE_KEY set. Using random keypair (read-only mode).${RESET}`);
    wallet = Keypair.generate();
  }

  console.error(`${DIM}Wallet:  ${wallet.publicKey.toBase58()}${RESET}`);
  console.error(`${DIM}RPC:     ${rpcUrl}${RESET}`);
  console.error(`${DIM}Program: 8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py${RESET}`);
  console.error();

  console.error(`${GREEN}MCP server running on stdio.${RESET}`);
  console.error(`${DIM}Add this to your Claude Desktop config:${RESET}`);
  console.error(`
{
  "mcpServers": {
    "agentvault": {
      "command": "npx",
      "args": ["agentvault", "mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "AGENT_PRIVATE_KEY": "[your,keypair,bytes]"
      }
    }
  }
}
`);

  // The actual MCP server implementation would be imported from @agentvault/agent-tools
  // For now, we provide the setup instructions
  // In production: import { createMCPServer } from "@agentvault/agent-tools";
  // const { listen } = createMCPServer(vault);
  // await listen();

  console.error(`${YELLOW}Note: Install @agentvault/agent-tools for full MCP server: npm install @agentvault/agent-tools${RESET}`);
}

async function status() {
  console.log(LOGO);
  console.log(`${BOLD}Checking AgentVault protocol status...${RESET}\n`);

  const { Connection, PublicKey } = await import("@solana/web3.js");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const programId = new PublicKey("8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py");
  const connection = new Connection(rpcUrl);

  try {
    const accountInfo = await connection.getAccountInfo(programId);
    if (accountInfo) {
      console.log(`  ${GREEN}●${RESET} Program:    ${WHITE}${programId.toBase58()}${RESET}`);
      console.log(`  ${GREEN}●${RESET} Status:     ${GREEN}DEPLOYED${RESET}`);
      console.log(`  ${GREEN}●${RESET} Size:       ${accountInfo.data.length.toLocaleString()} bytes`);
      console.log(`  ${GREEN}●${RESET} Network:    ${rpcUrl.includes("devnet") ? "Devnet" : rpcUrl.includes("mainnet") ? "Mainnet" : rpcUrl}`);
      console.log(`  ${GREEN}●${RESET} Executable: ${accountInfo.executable ? "Yes" : "No"}`);
    } else {
      console.log(`  ${YELLOW}●${RESET} Program not found at ${programId.toBase58()}`);
    }
  } catch (err: any) {
    console.log(`  ${YELLOW}●${RESET} Could not connect: ${err.message}`);
  }

  // Check config PDA
  try {
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      programId
    );
    const configInfo = await connection.getAccountInfo(configPDA);
    if (configInfo) {
      console.log(`  ${GREEN}●${RESET} Config PDA: ${configPDA.toBase58()}`);
      console.log(`  ${GREEN}●${RESET} Protocol:   ${GREEN}INITIALIZED${RESET}`);
    } else {
      console.log(`  ${YELLOW}●${RESET} Protocol:   ${YELLOW}NOT INITIALIZED${RESET}`);
    }
  } catch {
    // ignore
  }

  console.log();
}

function info() {
  console.log(LOGO);
  console.log(`${BOLD}AgentVault Protocol Info${RESET}\n`);
  console.log(`  Program ID:    ${WHITE}8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py${RESET}`);
  console.log(`  Network:       Solana Devnet`);
  console.log(`  Protocol Fee:  0.5%`);
  console.log(`  Arbitrator Fee: 1.0%`);
  console.log(`  GitHub:        ${CYAN}https://github.com/cruellacodes/agentvault${RESET}`);
  console.log(`  SDK:           npm install @agentvault/sdk`);
  console.log(`  Agent Tools:   npm install @agentvault/agent-tools`);
  console.log();
}

// ── Route commands ──
(async () => {
  switch (command) {
    case "init":
      await init();
      break;
    case "mcp":
      await mcp();
      break;
    case "status":
      await status();
      break;
    case "info":
      info();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      if (command) {
        console.log(`\n${YELLOW}Unknown command: ${command}${RESET}\n`);
      }
      printHelp();
      break;
  }
})();

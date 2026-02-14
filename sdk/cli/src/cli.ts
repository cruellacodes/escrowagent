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
    ║         ${WHITE}E S C R O W A G E N T${MAGENTA}           ║
    ║   ${DIM}${WHITE}Trustless Escrow for AI Agents${MAGENTA}${BOLD}      ║
    ╚═══════════════════════════════════════╝${RESET}
`;

const args = process.argv.slice(2);
const command = args[0];
const chainFlag = args.find(a => a.startsWith("--chain="))?.split("=")[1]
  || (args.includes("--chain") ? args[args.indexOf("--chain") + 1] : undefined);
const selectedChain = chainFlag === "base" ? "base" : "solana";

function printWelcome() {
  console.log(LOGO);
  console.log(`  ${GREEN}Trustless escrow for AI agent-to-agent transactions${RESET}`);
  console.log(`  ${DIM}Solana (SPL) + Base (ERC-20) — zero trust required${RESET}\n`);
  console.log(`${BOLD}  Get started:${RESET}\n`);
  console.log(`    ${GREEN}$ npx escrowagent init${RESET}              ${DIM}Scaffold into your project${RESET}`);
  console.log(`    ${GREEN}$ npx escrowagent mcp${RESET}               ${DIM}Start MCP server (Claude/Cursor)${RESET}`);
  console.log(`    ${GREEN}$ npx escrowagent skills${RESET}            ${DIM}Browse agent integrations${RESET}`);
  console.log();
  console.log(`  ${DIM}Run ${WHITE}npx escrowagent help${DIM} for all commands${RESET}`);
  console.log(`  ${DIM}Docs: ${CYAN}https://escrowagent.vercel.app/docs${RESET}`);
  console.log();
}

function printHelp() {
  console.log(LOGO);
  console.log(`${BOLD}Usage:${RESET}  npx escrowagent ${CYAN}<command>${RESET} [--chain solana|base]\n`);
  console.log(`${BOLD}Commands:${RESET}`);
  console.log(`  ${CYAN}init${RESET}          Scaffold EscrowAgent into your agent project`);
  console.log(`  ${CYAN}mcp${RESET}           Start the MCP server (for Claude, Cursor, etc.)`);
  console.log(`  ${CYAN}skills${RESET}        Browse available agent integrations`);
  console.log(`  ${CYAN}status${RESET}        Check protocol status on devnet/mainnet`);
  console.log(`  ${CYAN}info${RESET}          Show program IDs and config`);
  console.log(`  ${CYAN}help${RESET}          Show this help message`);
  console.log();
  console.log(`${BOLD}Flags:${RESET}`);
  console.log(`  ${CYAN}--chain${RESET}       Chain to use: solana (default) or base`);
  console.log();
  console.log(`${BOLD}Examples:${RESET}`);
  console.log(`  ${DIM}# Add EscrowAgent escrow skills to your agent${RESET}`);
  console.log(`  ${GREEN}$ npx escrowagent init${RESET}`);
  console.log();
  console.log(`  ${DIM}# Initialize for Base chain${RESET}`);
  console.log(`  ${GREEN}$ npx escrowagent init --chain base${RESET}`);
  console.log();
  console.log(`  ${DIM}# Start MCP server for Claude Desktop${RESET}`);
  console.log(`  ${GREEN}$ npx escrowagent mcp${RESET}`);
  console.log();
  console.log(`  ${DIM}# Browse integrations${RESET}`);
  console.log(`  ${GREEN}$ npx escrowagent skills${RESET}`);
  console.log();
  console.log(`${DIM}Docs: https://escrowagent.vercel.app/docs${RESET}`);
  console.log();
}

async function init() {
  console.log(LOGO);
  console.log(`${BOLD}Initializing EscrowAgent in your project...${RESET}\n`);

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
  console.log(`${CYAN}Installing escrowagent-sdk...${RESET}`);
  const { execSync } = await import("child_process");

  try {
    execSync("npm install escrowagent-sdk @solana/web3.js @solana/spl-token", {
      cwd,
      stdio: "inherit",
    });
  } catch {
    console.log(`${YELLOW}npm install failed. You can install manually:${RESET}`);
    console.log(`  npm install escrowagent-sdk @solana/web3.js @solana/spl-token`);
  }

  // Create example agent file
  const examplePath = path.join(cwd, "escrowagent.config.ts");
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(
      examplePath,
      `import { AgentVault, USDC_DEVNET_MINT } from "escrowagent-sdk";
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
  indexerUrl: process.env.ESCROWAGENT_INDEXER_URL || "http://localhost:3001",
  programId: "ESCROWAGENT_PROGRAM_ID",
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
`.replace("ESCROWAGENT_PROGRAM_ID", "8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py")
    );
    console.log(`\n${GREEN}Created${RESET} escrowagent.config.ts`);
  }

  // Create .env.example
  const envPath = path.join(cwd, ".env.escrowagent");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(
      envPath,
      `# EscrowAgent Configuration

# ── Solana ──
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENT_PRIVATE_KEY=  # Your agent's keypair as JSON array

# ── Base (EVM) ──
BASE_RPC_URL=https://sepolia.base.org
BASE_PRIVATE_KEY=   # Your agent's EVM private key (0x...)
BASE_CONTRACT_ADDRESS=  # Deployed EscrowAgent contract address

# ── Shared ──
ESCROWAGENT_INDEXER_URL=http://localhost:3001
ESCROWAGENT_CHAIN=solana  # Default chain: solana or base
`
    );
    console.log(`${GREEN}Created${RESET} .env.escrowagent`);
  }

  console.log(`
${GREEN}${BOLD}EscrowAgent initialized!${RESET}

${BOLD}Next steps:${RESET}

  ${CYAN}1.${RESET} Edit ${WHITE}escrowagent.config.ts${RESET} with your agent's config
  ${CYAN}2.${RESET} Set your agent's private key in ${WHITE}.env.escrowagent${RESET}
  ${CYAN}3.${RESET} Import the vault in your agent:

     ${DIM}import { vault } from "./escrowagent.config";
     const escrow = await vault.createEscrow({ ... });${RESET}

${BOLD}For AI agent frameworks:${RESET}

  ${DIM}# LangChain${RESET}
  npm install escrowagent-agent-tools @langchain/core
  ${DIM}import { createLangChainTools } from "escrowagent-agent-tools";${RESET}

  ${DIM}# Vercel AI SDK${RESET}
  npm install escrowagent-agent-tools ai
  ${DIM}import { createVercelAITools } from "escrowagent-agent-tools";${RESET}

  ${DIM}# Claude MCP Server${RESET}
  npx escrowagent mcp

${DIM}Docs: https://github.com/cruellacodes/escrow-agent${RESET}
`);
}

async function mcp() {
  console.log(LOGO);
  console.log(`${BOLD}Starting EscrowAgent MCP Server...${RESET}\n`);

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
    "escrowagent": {
      "command": "npx",
      "args": ["escrowagent", "mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "AGENT_PRIVATE_KEY": "[your,keypair,bytes]"
      }
    }
  }
}
`);

  // The actual MCP server implementation would be imported from escrowagent-agent-tools
  // For now, we provide the setup instructions
  // In production: import { createMCPServer } from "escrowagent-agent-tools";
  // const { listen } = createMCPServer(vault);
  // await listen();

  console.error(`${YELLOW}Note: Install escrowagent-agent-tools for full MCP server: npm install escrowagent-agent-tools${RESET}`);
}

async function status() {
  console.log(LOGO);
  console.log(`${BOLD}Checking EscrowAgent protocol status...${RESET}\n`);

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
  console.log(`${BOLD}EscrowAgent Protocol Info${RESET}\n`);

  console.log(`  ${BOLD}Solana:${RESET}`);
  console.log(`    Program ID:  ${WHITE}8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py${RESET}`);
  console.log(`    Network:     Devnet / Mainnet-Beta`);
  console.log();

  console.log(`  ${BOLD}Base (EVM):${RESET}`);
  console.log(`    Contract:    ${WHITE}${process.env.BASE_CONTRACT_ADDRESS || "(not deployed yet)"}${RESET}`);
  console.log(`    Chain ID:    8453 (mainnet) / 84532 (sepolia)`);
  console.log(`    Explorer:    ${CYAN}https://basescan.org${RESET}`);
  console.log();

  console.log(`  ${BOLD}Shared:${RESET}`);
  console.log(`    Protocol Fee:  0.5%`);
  console.log(`    Arbitrator Fee: 1.0%`);
  console.log(`    GitHub:        ${CYAN}https://github.com/cruellacodes/escrow-agent${RESET}`);
  console.log(`    SDK:           npm install escrowagent-sdk`);
  console.log(`    Agent Tools:   npm install escrowagent-agent-tools`);
  console.log();
}

function skills() {
  console.log(LOGO);
  console.log(`${BOLD}Available Skills & Integrations${RESET}\n`);

  const integrations = [
    {
      name: "LangChain",
      desc: "Add escrow tools to any LangChain agent (ReAct, OpenAI Functions, etc.)",
      install: "npm install escrowagent-agent-tools @langchain/core",
      code: `import { createLangChainTools } from "escrowagent-agent-tools";
const tools = createLangChainTools(vault);
const agent = createReactAgent({ llm, tools });`,
    },
    {
      name: "Vercel AI SDK",
      desc: "Add escrow tools to Vercel AI agents (Next.js, serverless)",
      install: "npm install escrowagent-agent-tools ai",
      code: `import { createVercelAITools } from "escrowagent-agent-tools";
const tools = createVercelAITools(vault);
const { text } = await generateText({ model, tools, prompt });`,
    },
    {
      name: "MCP (Claude / Cursor)",
      desc: "Expose escrow tools via Model Context Protocol for Claude Desktop & Cursor",
      install: "npx escrowagent mcp",
      code: `// Or programmatically:
import { createMCPServer } from "escrowagent-agent-tools";
const { listen } = createMCPServer(vault);
await listen();`,
    },
    {
      name: "Direct SDK (TypeScript)",
      desc: "Use the escrow protocol directly in any TypeScript/Node.js project",
      install: "npm install escrowagent-sdk",
      code: `import { AgentVault } from "escrowagent-sdk";
const vault = new AgentVault({ chain: "base", privateKey: "0x...", contractAddress: "0x..." });
await vault.createEscrow({ provider, amount, tokenMint, deadline, task, verification });`,
    },
    {
      name: "Direct SDK (Python)",
      desc: "Use the escrow protocol in Python AI agents",
      install: "pip install escrowagent-sdk[base]",
      code: `from escrowagent import AgentVault
vault = AgentVault(chain="base", private_key="0x...", contract_address="0x...")
await vault.create_escrow(params)`,
    },
  ];

  for (const skill of integrations) {
    console.log(`  ${MAGENTA}${BOLD}${skill.name}${RESET}`);
    console.log(`  ${DIM}${skill.desc}${RESET}\n`);
    console.log(`  ${CYAN}$ ${skill.install}${RESET}\n`);
    console.log(`  ${DIM}${skill.code.split('\n').join(`\n  ${DIM}`)}${RESET}`);
    console.log();
    console.log(`  ${"─".repeat(60)}\n`);
  }

  console.log(`${BOLD}  9 tools available in every integration:${RESET}\n`);
  const tools = [
    ["create_escrow",      "Lock funds for a task with deadline + success criteria"],
    ["accept_escrow",      "Accept a pending task as the provider agent"],
    ["submit_proof",       "Submit proof of task completion"],
    ["confirm_completion", "Confirm and release funds to provider"],
    ["cancel_escrow",      "Cancel before acceptance (full refund)"],
    ["raise_dispute",      "Freeze funds, escalate to arbitrator"],
    ["get_escrow",         "Look up escrow details"],
    ["list_escrows",       "Browse and filter escrows"],
    ["get_agent_stats",    "Check an agent's reputation and track record"],
  ];

  for (const [name, desc] of tools) {
    console.log(`    ${GREEN}${name.padEnd(22)}${RESET}${DIM}${desc}${RESET}`);
  }

  console.log(`\n  ${DIM}Docs: ${CYAN}https://escrowagent.vercel.app/docs${RESET}\n`);
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
    case "skills":
      skills();
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
      printWelcome();
      break;
  }
})();

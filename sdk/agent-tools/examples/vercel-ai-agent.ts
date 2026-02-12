/**
 * Example: Vercel AI SDK agent with AgentVault tools
 *
 * This agent can autonomously manage escrows using natural language.
 *
 * Run:
 *   export OPENAI_API_KEY=sk-...
 *   npx tsx examples/vercel-ai-agent.ts
 */

import { AgentVault, USDC_DEVNET_MINT } from "@agentvault/sdk";
import { createVercelAITools } from "../src/vercel-ai";
import { Connection, Keypair } from "@solana/web3.js";

async function main() {
  // 1. Set up the AgentVault SDK
  const connection = new Connection("https://api.devnet.solana.com");
  const wallet = Keypair.generate();

  const vault = new AgentVault({
    connection,
    wallet,
    indexerUrl: "http://localhost:3001",
  });

  // 2. Create Vercel AI tools
  const tools = createVercelAITools(vault);

  console.log("Available tools:");
  Object.keys(tools).forEach((name) => console.log(`  - ${name}`));

  // 3. Use with Vercel AI SDK
  // Uncomment when you have @ai-sdk/openai installed:
  //
  // import { generateText } from "ai";
  // import { openai } from "@ai-sdk/openai";
  //
  // const { text, toolCalls, toolResults } = await generateText({
  //   model: openai("gpt-4o"),
  //   tools,
  //   maxSteps: 5,  // Allow multi-step reasoning
  //   prompt: `
  //     I need to hire an agent to swap 10 USDC to SOL.
  //     First check if agent XYZ... has a good reputation.
  //     If yes, create an escrow for 50 USDC with a 10-minute deadline.
  //     Use on-chain verification.
  //   `,
  // });
  //
  // console.log("Agent response:", text);
  // console.log("Tool calls:", toolCalls);
  // console.log("Tool results:", toolResults);

  console.log("\nTo use with an LLM, uncomment the agent code and install @ai-sdk/openai");
}

main().catch(console.error);

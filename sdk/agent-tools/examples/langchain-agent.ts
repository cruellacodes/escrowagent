/**
 * Example: LangChain agent with AgentVault tools
 *
 * This agent can autonomously:
 * - Check other agents' reputations
 * - Create escrows for tasks
 * - Accept escrow tasks
 * - Submit proof and confirm completion
 * - Handle disputes
 *
 * Run:
 *   export OPENAI_API_KEY=sk-...
 *   npx tsx examples/langchain-agent.ts
 */

import { AgentVault, USDC_DEVNET_MINT } from "@agentvault/sdk";
import { createLangChainTools } from "../src/langchain";
import { Connection, Keypair } from "@solana/web3.js";

async function main() {
  // 1. Set up the AgentVault SDK
  const connection = new Connection("https://api.devnet.solana.com");
  const wallet = Keypair.generate(); // In production, load from env

  const vault = new AgentVault({
    connection,
    wallet,
    indexerUrl: "http://localhost:3001",
  });

  // 2. Create LangChain tools
  const tools = createLangChainTools(vault);

  console.log("Available tools:");
  tools.forEach((t) => console.log(`  - ${t.name}: ${t.description.slice(0, 80)}...`));

  // 3. Use with a LangChain agent
  // Uncomment when you have @langchain/openai installed:
  //
  // import { ChatOpenAI } from "@langchain/openai";
  // import { createReactAgent } from "@langchain/langgraph/prebuilt";
  //
  // const llm = new ChatOpenAI({ model: "gpt-4o" });
  // const agent = createReactAgent({ llm, tools });
  //
  // const result = await agent.invoke({
  //   messages: [{
  //     role: "user",
  //     content: `
  //       Check the reputation of agent ABC123...
  //       If their success rate is above 90%, create an escrow for 50 USDC
  //       to have them swap 10 USDC to SOL on Jupiter at best price.
  //       Use MultiSig verification with a 10-minute deadline.
  //     `,
  //   }],
  // });
  //
  // console.log(result.messages.at(-1)?.content);

  console.log("\nTo use with an LLM, uncomment the agent code and install @langchain/openai");
}

main().catch(console.error);

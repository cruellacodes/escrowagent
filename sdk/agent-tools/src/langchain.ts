/**
 * LangChain Tools adapter for EscrowAgent.
 *
 * Usage:
 *   import { createLangChainTools } from "@escrowagent/agent-tools";
 *   const tools = createLangChainTools(vault);
 *   const agent = createReactAgent({ llm, tools });
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentVault } from "escrowagent-sdk";
import { TOOL_DEFINITIONS } from "./definitions";
import { ToolExecutor } from "./executor";

/**
 * Create LangChain-compatible tools from an EscrowAgent SDK instance.
 *
 * @param vault - Initialized EscrowAgent client
 * @param toolNames - Optional list of tool names to include (default: all)
 * @returns Array of DynamicStructuredTool instances
 *
 * @example
 * ```ts
 * import { AgentVault } from "@escrowagent/sdk";
 * import { createLangChainTools } from "@escrowagent/agent-tools";
 * import { ChatOpenAI } from "@langchain/openai";
 * import { createReactAgent } from "@langchain/langgraph/prebuilt";
 *
 * const vault = new AgentVault({ connection, wallet });
 * const tools = createLangChainTools(vault);
 * const agent = createReactAgent({ llm: new ChatOpenAI(), tools });
 *
 * const result = await agent.invoke({
 *   messages: [{ role: "user", content: "Create an escrow for 50 USDC..." }]
 * });
 * ```
 */
export function createLangChainTools(
  vault: AgentVault,
  toolNames?: string[]
): DynamicStructuredTool[] {
  const executor = new ToolExecutor(vault);

  const definitions = Object.values(TOOL_DEFINITIONS).filter(
    (def) => !toolNames || toolNames.includes(def.name)
  );

  return definitions.map(
    (def) =>
      new DynamicStructuredTool({
        name: def.name,
        description: def.description,
        schema: def.parameters as any,
        func: async (input: any) => executor.execute(def.name, input),
      })
  ) as any;
}

/**
 * Create a single LangChain tool by name.
 */
export function createLangChainTool(
  vault: AgentVault,
  toolName: keyof typeof TOOL_DEFINITIONS
): DynamicStructuredTool {
  const executor = new ToolExecutor(vault);
  const def = TOOL_DEFINITIONS[toolName];

  return new DynamicStructuredTool({
    name: def.name,
    description: def.description,
    schema: def.parameters as any,
    func: async (input: any) => executor.execute(def.name, input),
  });
}

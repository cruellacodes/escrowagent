/**
 * Vercel AI SDK tools adapter for EscrowAgent.
 *
 * Usage:
 *   import { createVercelAITools } from "@escrowagent/agent-tools";
 *   const tools = createVercelAITools(vault);
 *   const result = await generateText({ model, tools, prompt });
 */

import { tool } from "ai";
import type { AgentVault } from "escrowagent-sdk";
import { TOOL_DEFINITIONS } from "./definitions";
import { ToolExecutor } from "./executor";

/**
 * Create Vercel AI SDK tools from an EscrowAgent SDK instance.
 *
 * @param vault - Initialized EscrowAgent client
 * @param toolNames - Optional list of tool names to include (default: all)
 * @returns Record of tool name → Vercel AI tool
 *
 * @example
 * ```ts
 * import { AgentVault } from "@escrowagent/sdk";
 * import { createVercelAITools } from "@escrowagent/agent-tools";
 * import { generateText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 *
 * const vault = new AgentVault({ connection, wallet });
 * const tools = createVercelAITools(vault);
 *
 * const { text } = await generateText({
 *   model: openai("gpt-4o"),
 *   tools,
 *   prompt: "Check the reputation of agent ABC123..., then create an escrow if they're trustworthy",
 * });
 * ```
 */
export function createVercelAITools(
  vault: AgentVault,
  toolNames?: string[]
): Record<string, ReturnType<typeof tool>> {
  const executor = new ToolExecutor(vault);

  const definitions = Object.entries(TOOL_DEFINITIONS).filter(
    ([name]) => !toolNames || toolNames.includes(name)
  );

  const tools: Record<string, any> = {};

  for (const [name, def] of definitions) {
    tools[name] = tool({
      description: def.description,
      parameters: def.parameters,
      execute: async (input: any) => {
        const result = await executor.execute(name, input);
        return JSON.parse(result);
      },
    });
  }

  return tools;
}

/**
 * Create a single Vercel AI tool by name.
 */
export function createVercelAITool(
  vault: AgentVault,
  toolName: keyof typeof TOOL_DEFINITIONS
): any {
  const executor = new ToolExecutor(vault);
  const def = TOOL_DEFINITIONS[toolName];

  return tool({
    description: def.description,
    parameters: def.parameters,
    execute: async (input: any) => {
      const result = await executor.execute(toolName, input);
      return JSON.parse(result);
    },
  });
}

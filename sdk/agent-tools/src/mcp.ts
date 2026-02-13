/**
 * MCP (Model Context Protocol) server for EscrowAgent.
 *
 * Exposes EscrowAgent operations as MCP tools that any MCP-compatible
 * client (Claude Desktop, Cursor, etc.) can use.
 *
 * Usage:
 *   import { createMCPServer } from "@escrowagent/agent-tools";
 *   const server = createMCPServer(vault);
 *   server.listen();  // stdio transport
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentVault } from "escrowagent-sdk";
import { TOOL_DEFINITIONS } from "./definitions";
import { ToolExecutor } from "./executor";
import { zodToJsonSchema } from "./utils";

/**
 * Create an MCP server that exposes EscrowAgent tools.
 *
 * @param vault - Initialized EscrowAgent client
 * @returns MCP Server instance
 *
 * @example
 * ```ts
 * // mcp-server.ts — run as a separate process
 * import { AgentVault } from "@escrowagent/sdk";
 * import { createMCPServer } from "@escrowagent/agent-tools";
 * import { Connection, Keypair } from "@solana/web3.js";
 *
 * const vault = new AgentVault({
 *   connection: new Connection(process.env.RPC_URL!),
 *   wallet: Keypair.fromSecretKey(...),
 * });
 *
 * const server = createMCPServer(vault);
 * server.listen();
 * ```
 *
 * Then in your MCP client config (e.g. claude_desktop_config.json):
 * ```json
 * {
 *   "mcpServers": {
 *     "escrowagent": {
 *       "command": "npx",
 *       "args": ["tsx", "mcp-server.ts"]
 *     }
 *   }
 * }
 * ```
 */
export function createMCPServer(vault: AgentVault): {
  server: Server;
  listen: () => Promise<void>;
} {
  const executor = new ToolExecutor(vault);

  const server = new Server(
    {
      name: "escrowagent",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.values(TOOL_DEFINITIONS).map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: zodToJsonSchema(def.parameters),
      })),
    };
  });

  // Execute a tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "No arguments provided" }) },
        ],
      };
    }

    const result = await executor.execute(name, args);

    return {
      content: [{ type: "text" as const, text: result }],
    };
  });

  async function listen() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[EscrowAgent MCP] Server running on stdio");
  }

  return { server, listen };
}

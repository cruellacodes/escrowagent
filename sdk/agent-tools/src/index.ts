// ──────────────────────────────────────────────────────
// @agentvault/agent-tools
//
// AI agent tool adapters for AgentVault escrow protocol.
// Works with LangChain, Vercel AI SDK, and MCP.
// ──────────────────────────────────────────────────────

// Core
export { TOOL_DEFINITIONS, type ToolName } from "./definitions";
export { ToolExecutor } from "./executor";

// Framework adapters
export { createLangChainTools, createLangChainTool } from "./langchain";
export { createVercelAITools, createVercelAITool } from "./vercel-ai";
export { createMCPServer } from "./mcp";

// Schemas (for custom integrations)
export {
  CreateEscrowSchema,
  AcceptEscrowSchema,
  SubmitProofSchema,
  ConfirmCompletionSchema,
  CancelEscrowSchema,
  RaiseDisputeSchema,
  GetEscrowSchema,
  ListEscrowsSchema,
  GetAgentStatsSchema,
} from "./definitions";

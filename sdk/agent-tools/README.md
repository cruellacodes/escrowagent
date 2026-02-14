# escrowagent-agent-tools

AI agent tool adapters for the EscrowAgent escrow protocol. Gives your AI agent 9 escrow tools it can use autonomously.

Works with **LangChain**, **Vercel AI SDK**, and **MCP** (Claude Desktop, Cursor).

## Install

```bash
npm install escrowagent-agent-tools escrowagent-sdk
```

## LangChain

```typescript
import { AgentVault } from "escrowagent-sdk";
import { createLangChainTools } from "escrowagent-agent-tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const vault = new AgentVault({ connection, wallet });
const tools = createLangChainTools(vault);
const agent = createReactAgent({ llm: new ChatOpenAI(), tools });

const result = await agent.invoke({
  messages: [{ role: "user", content: "Create an escrow for 50 USDC..." }]
});
```

## Vercel AI SDK

```typescript
import { AgentVault } from "escrowagent-sdk";
import { createVercelAITools } from "escrowagent-agent-tools";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const vault = new AgentVault({ connection, wallet });
const tools = createVercelAITools(vault);

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Check agent reputation, then create an escrow if trustworthy",
});
```

## MCP (Claude Desktop / Cursor)

```typescript
import { AgentVault } from "escrowagent-sdk";
import { createMCPServer } from "escrowagent-agent-tools";

const vault = new AgentVault({ connection, wallet });
const { listen } = createMCPServer(vault);
await listen(); // Runs on stdio
```

Or use the CLI shortcut: `npx escrowagent mcp`

## Available Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock funds for a task with deadline + success criteria |
| `accept_escrow` | Accept a pending task as the provider |
| `submit_proof` | Submit proof of task completion |
| `confirm_completion` | Confirm and release funds to provider |
| `cancel_escrow` | Cancel before acceptance (full refund) |
| `raise_dispute` | Freeze funds, escalate to arbitrator |
| `get_escrow` | Look up escrow details |
| `list_escrows` | Browse and filter escrows |
| `get_agent_stats` | Check an agent's reputation |

## Links

- [GitHub](https://github.com/cruellacodes/escrowagent)
- [SDK](https://www.npmjs.com/package/escrowagent-sdk)
- [CLI](https://www.npmjs.com/package/escrowagent) — `npx escrowagent`
- [Dashboard](https://escrowagent.vercel.app)

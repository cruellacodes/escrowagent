import Anthropic from "@anthropic-ai/sdk";
import type { DisputeCase, AiRuling } from "./types";

// ──────────────────────────────────────────────────────
// Claude-powered Dispute Analyzer
// ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an impartial escrow arbitrator for the EscrowAgent protocol. Your job is to review evidence from a disputed escrow and issue a fair ruling.

You will receive:
- A task description and success criteria (what was supposed to be done)
- Proof submissions from the provider (what they claim to have done)
- The dispute reason (why someone is unhappy)
- Who raised the dispute (client or provider)
- Financial details (amount, deadline)

Your ruling options:
1. "PayProvider" — provider completed the work satisfactorily. Release funds to provider.
2. "PayClient" — provider failed to meet criteria. Refund the client.
3. "Split" — partial completion. Split funds proportionally (specify clientBps + providerBps = 10000).

Rules for judging:
- Focus on whether the SUCCESS CRITERIA were met, not subjective quality.
- If proof exists and matches the criteria, rule PayProvider.
- If no proof was submitted or proof is clearly invalid, rule PayClient.
- If criteria were partially met, use Split with fair percentages.
- Be conservative — when in doubt, lean toward protecting the client's funds.
- Your confidence score (0.0-1.0) reflects how clear-cut the case is.

Respond ONLY with a JSON object in this exact format:
{
  "ruling": "PayProvider" | "PayClient" | "Split",
  "confidence": 0.0-1.0,
  "reasoning": "Clear explanation of your decision in 2-3 sentences.",
  "clientBps": 0-10000,
  "providerBps": 0-10000
}

For PayProvider: clientBps=0, providerBps=10000
For PayClient: clientBps=10000, providerBps=0
For Split: clientBps + providerBps must equal 10000`;

function buildUserPrompt(dispute: DisputeCase): string {
  const proofList = dispute.proofs.length > 0
    ? dispute.proofs.map((p, i) =>
      `  Proof ${i + 1}: [${p.type}] submitted at ${p.submittedAt}\n  Data: ${p.data}`
    ).join("\n")
    : "  No proofs submitted.";

  const criteriaList = dispute.taskCriteria.length > 0
    ? dispute.taskCriteria.map((c, i) =>
      `  ${i + 1}. [${c.type}] ${c.description}`
    ).join("\n")
    : "  No specific criteria defined.";

  return `ESCROW DISPUTE — Please review and issue a ruling.

ESCROW DETAILS:
  Chain: ${dispute.chain}
  Amount: ${dispute.amount} (smallest token unit)
  Token: ${dispute.tokenMint}
  Created: ${dispute.createdAt}
  Deadline: ${dispute.deadline}

TASK DESCRIPTION:
  ${dispute.taskDescription || "No description provided."}

SUCCESS CRITERIA:
${criteriaList}

PROOF SUBMISSIONS:
${proofList}

DISPUTE:
  Raised by: ${dispute.disputeRaisedBy === dispute.client ? "CLIENT (the payer)" : "PROVIDER (the worker)"}
  Reason: ${dispute.disputeReason || "No reason provided."}

Please analyze the evidence and issue your ruling as JSON.`;
}

export async function analyzeDispute(
  apiKey: string,
  dispute: DisputeCase
): Promise<{ ruling: AiRuling; prompt: string; rawResponse: string }> {
  const client = new Anthropic({ apiKey });

  const userPrompt = buildUserPrompt(dispute);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawResponse = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = rawResponse;
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[Arbitrator] Failed to parse AI response as JSON:", rawResponse);
    // Default to conservative ruling
    parsed = {
      ruling: "PayClient",
      confidence: 0.3,
      reasoning: "AI response could not be parsed. Defaulting to client refund for safety.",
      clientBps: 10000,
      providerBps: 0,
    };
  }

  // Validate and normalize
  const ruling: AiRuling = {
    ruling: ["PayClient", "PayProvider", "Split"].includes(parsed.ruling)
      ? parsed.ruling
      : "PayClient",
    confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
    reasoning: String(parsed.reasoning || "No reasoning provided."),
    clientBps: parseInt(parsed.clientBps, 10) || 0,
    providerBps: parseInt(parsed.providerBps, 10) || 0,
  };

  // Enforce BPS rules
  if (ruling.ruling === "PayClient") {
    ruling.clientBps = 10000;
    ruling.providerBps = 0;
  } else if (ruling.ruling === "PayProvider") {
    ruling.clientBps = 0;
    ruling.providerBps = 10000;
  } else if (ruling.ruling === "Split") {
    if (ruling.clientBps + ruling.providerBps !== 10000) {
      // Normalize to sum to 10000
      const total = ruling.clientBps + ruling.providerBps;
      if (total > 0) {
        ruling.clientBps = Math.round((ruling.clientBps / total) * 10000);
        ruling.providerBps = 10000 - ruling.clientBps;
      } else {
        ruling.clientBps = 5000;
        ruling.providerBps = 5000;
      }
    }
  }

  return { ruling, prompt: userPrompt, rawResponse };
}

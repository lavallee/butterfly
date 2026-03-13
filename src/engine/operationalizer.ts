import Anthropic from "@anthropic-ai/sdk";
import type { OperationalizationResult } from "@/types";
import { trackTokens } from "./budget";

const client = new Anthropic();

/**
 * Convert a vague question into a precise, time-bound, measurable prediction.
 */
export async function operationalize(
  question: string
): Promise<OperationalizationResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are a forecasting operationalization specialist. Your job is to convert vague questions about future events into precise, measurable, time-bound predictions that can be clearly resolved as yes/no/partial.

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Convert this question into a precise, resolvable forecast:

"${question}"

Respond with JSON (no markdown fences):
{
  "operationalized_question": "A precise, time-bound version with specific thresholds. Include numbers, dates, and measurable criteria.",
  "resolution_criteria": "How to determine yes/no/partial. What data source to check, what specific threshold counts.",
  "resolution_date": "YYYY-MM-DD when the outcome should be knowable",
  "reasoning": "Brief explanation of the choices made in operationalization"
}

Guidelines:
- Be specific: "oil prices rise" → "Brent crude monthly average exceeds $X by YYYY-MM"
- Set a realistic resolution date — not too soon to observe, not so far that it's useless
- Resolution criteria should reference publicly available data sources where possible
- If the question is already precise, keep it close to the original`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const usage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
  };

  trackTokens(usage.input, usage.output);

  try {
    const parsed = JSON.parse(text);
    return {
      operationalized_question: parsed.operationalized_question,
      resolution_criteria: parsed.resolution_criteria,
      resolution_date: parsed.resolution_date,
      reasoning: parsed.reasoning || "",
      token_usage: usage,
    };
  } catch {
    return {
      operationalized_question: question,
      resolution_criteria: "",
      resolution_date: "",
      reasoning: "Failed to operationalize",
      token_usage: usage,
    };
  }
}

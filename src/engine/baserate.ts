import Anthropic from "@anthropic-ai/sdk";
import type { BaseRateResult } from "@/types";
import { trackTokens } from "./budget";

const client = new Anthropic();

/**
 * Identify the reference class and historical base rate for a question.
 */
export async function findBaseRate(
  question: string
): Promise<BaseRateResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are a reference class forecasting specialist. Given a question about a future event, identify the most appropriate reference class from historical data and estimate the base rate.

Think about:
- What category of events does this belong to?
- How often have similar events occurred historically?
- What's the sample size?

Be honest about uncertainty. If the reference class is small or poorly defined, say so.

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Identify the reference class and base rate for this question:

"${question}"

Respond with JSON (no markdown fences):
{
  "reference_class": "Description of the reference class (e.g., 'major strait blockades since 1945')",
  "base_rate": 0.15,
  "reasoning": "Why this reference class is appropriate and how the rate was estimated. Include sample size if possible.",
  "historical_examples": ["Example 1 with year and outcome", "Example 2 with year and outcome"]
}`,
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
      reference_class: parsed.reference_class,
      base_rate: parsed.base_rate,
      reasoning: parsed.reasoning,
      historical_examples: parsed.historical_examples || [],
      token_usage: usage,
    };
  } catch {
    return {
      reference_class: "Unknown",
      base_rate: 0.5,
      reasoning: "Failed to identify reference class",
      historical_examples: [],
      token_usage: usage,
    };
  }
}

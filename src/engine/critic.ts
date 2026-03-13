import Anthropic from "@anthropic-ai/sdk";
import type { QuestionNode, ResearchResult, CritiqueResult } from "@/types";

const client = new Anthropic();

/**
 * Critique a research result — identify weak claims, missing perspectives,
 * and generate counter-questions that challenge the findings.
 */
export async function critique(
  node: QuestionNode,
  result: ResearchResult
): Promise<CritiqueResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `You are a skeptical analyst reviewing research produced by another analyst. Your job is to:
1. Identify the weakest claims and assumptions
2. Point out missing perspectives or blind spots
3. Suggest whether the probability and confidence estimates should be adjusted
4. Generate 0-2 counter-questions that represent opposing forces or alternative outcomes

Be concise and constructive. Focus on what matters most.

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Review this research and provide your critique.

**Question:** ${node.question}

**Research Summary:**
${result.summary}

**Probability Estimate:** ${result.probability_estimate}
**Confidence:** ${result.confidence}

**Evidence cited:** ${result.evidence.length} items

Respond with a JSON object (no markdown fences):
{
  "critique": "Your 2-4 sentence critique focusing on the weakest points and blind spots.",
  "adjusted_probability": null,
  "adjusted_confidence": null,
  "counter_questions": [
    {
      "question": "A question representing an opposing force or alternative outcome",
      "relationship": "prevents|weakens",
      "estimated_probability": 0.3,
      "reasoning": "Why this counter-force matters"
    }
  ]
}

Set adjusted_probability/adjusted_confidence to a number only if you think the original estimates are significantly off. Otherwise leave as null.
Generate 0-2 counter-questions — only if there are genuine opposing forces worth tracking.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const usage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
  };

  try {
    const parsed = JSON.parse(text);
    return {
      critique: parsed.critique || "No critique generated.",
      adjusted_probability: parsed.adjusted_probability ?? null,
      adjusted_confidence: parsed.adjusted_confidence ?? null,
      counter_questions: parsed.counter_questions || [],
      token_usage: usage,
    };
  } catch {
    return {
      critique: text.slice(0, 500),
      adjusted_probability: null,
      adjusted_confidence: null,
      counter_questions: [],
      token_usage: usage,
    };
  }
}

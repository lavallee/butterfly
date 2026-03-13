import Anthropic from "@anthropic-ai/sdk";
import { getEngineState, setEngineState } from "@/lib/db";
import type { QuestionNode, ResearchResult } from "@/types";

const client = new Anthropic();
const MAX_FINDINGS_LENGTH = 3000; // characters, ~750 tokens

/**
 * Maintain a running summary of key findings across the entire research graph.
 * Injected into every research prompt as global context.
 */

export function getKeyFindings(): string {
  return getEngineState("key_findings") || "";
}

/**
 * After a research cycle, extract key findings and append to the running summary.
 * Compress if it gets too long.
 */
export async function updateKeyFindings(
  node: QuestionNode,
  result: ResearchResult
): Promise<{ token_usage: { input: number; output: number } }> {
  const existing = getKeyFindings();

  // Extract 1-2 key findings from this cycle
  const newEntry = `[${node.question.slice(0, 80)}] P=${result.probability_estimate.toFixed(2)}: ${
    result.summary?.slice(0, 200) || "No summary"
  }`;

  let updated = existing ? `${existing}\n${newEntry}` : newEntry;

  // If too long, compress with an LLM call
  if (updated.length > MAX_FINDINGS_LENGTH) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Compress this running summary of research findings into a concise version (~500 words max). Keep the most important facts, probability estimates, and causal relationships. Drop redundancies and less critical details.

${updated}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : updated;
    updated = text;

    setEngineState("key_findings", updated);
    return {
      token_usage: {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
      },
    };
  }

  setEngineState("key_findings", updated);
  return { token_usage: { input: 0, output: 0 } };
}

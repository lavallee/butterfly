import Anthropic from "@anthropic-ai/sdk";
import type { QuestionNode, ResearchResult } from "@/types";

const client = new Anthropic();

/**
 * Research a single question. This is the core unit of work —
 * it produces a ~1000 word synthesis plus follow-up questions.
 */
export async function research(
  node: QuestionNode,
  context: { ancestors: string[]; siblings: string[]; keyFindings?: string; baseRate?: number | null }
): Promise<ResearchResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a geopolitical and economic research analyst working on a cascading effects analysis engine. Your job is to research specific questions about the downstream consequences of world events.

You produce concise, evidence-based analysis (~1000 words or less). When a topic is too complex for a single analysis, you flag it for decomposition into sub-questions.

You think laterally — not just obvious first-order effects, but second and third-order consequences across domains (economic, political, social, technological, environmental).

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Research the following question in the context of a cascading effects analysis:

**Question:** ${node.operationalized_question || node.question}

**Context chain (ancestors):**
${context.ancestors.map((q, i) => `${i + 1}. ${q}`).join("\n") || "This is a root question."}

**Sibling questions already being tracked:**
${context.siblings.map((q) => `- ${q}`).join("\n") || "None yet."}

${context.baseRate != null ? `**Reference Class Anchoring:**\nHistorical base rate: ${(context.baseRate * 100).toFixed(0)}%\nUse this as your starting anchor, then adjust based on inside-view evidence specific to this situation.\n` : ""}
${context.keyFindings ? `**Key findings from other research branches:**\n${context.keyFindings}` : ""}

Respond with a JSON object (no markdown fences) with this exact structure:
{
  "summary": "Your research synthesis, ~1000 words or less. Include specific data points, named sources, and concrete mechanisms where possible.",
  "evidence": [
    {"content": "A specific factual claim or data point", "source": "Named source or null"}
  ],
  "probability_estimate": 0.7,
  "confidence": 0.5,
  "follow_up_questions": [
    {
      "question": "A downstream question this research raises",
      "relationship": "causes|enables|prevents|amplifies|weakens",
      "estimated_probability": 0.5,
      "reasoning": "Why this follows and why it matters"
    }
  ],
  "should_decompose": false,
  "sub_questions": []
}

Guidelines:
- probability_estimate: How likely is the event/outcome described in the question? (0-1)
- confidence: How confident are you in that probability estimate? (0-1, where 0.1 = very uncertain, 0.9 = very well-supported)
- Follow-up questions should be SPECIFIC and RESEARCHABLE, not vague. Think about consequences across different domains.
- Generate 2-5 follow-up questions. Prefer quality over quantity.
- Set should_decompose=true if the question is too broad to answer well in ~1000 words. Provide sub_questions that break it into manageable pieces.
- Don't duplicate sibling questions that are already being tracked.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const tokenUsage = {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0,
  };

  try {
    const result = JSON.parse(text);
    return {
      summary: result.summary,
      evidence: (result.evidence || []).map((e: any) => ({
        content: e.content,
        source: e.source || null,
        found_at: new Date().toISOString(),
      })),
      probability_estimate: clamp(result.probability_estimate, 0, 1),
      confidence: clamp(result.confidence, 0, 1),
      follow_up_questions: result.follow_up_questions || [],
      should_decompose: result.should_decompose || false,
      sub_questions: result.sub_questions || [],
      token_usage: tokenUsage,
    };
  } catch {
    return {
      summary: text,
      evidence: [],
      probability_estimate: node.probability,
      confidence: 0.1,
      follow_up_questions: [],
      should_decompose: false,
      token_usage: tokenUsage,
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

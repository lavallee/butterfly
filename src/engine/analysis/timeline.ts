import Anthropic from "@anthropic-ai/sdk";
import type { QuestionNode } from "@/types";
import { getAllNodes, upsertNode, logActivity } from "@/lib/db";
import { trackTokens } from "../budget";

const client = new Anthropic();

export interface TemporalEstimate {
  onset: "days" | "weeks" | "months" | "quarters" | "years";
  onset_value: number;
  duration: "transient" | "sustained" | "permanent";
  peak_window: string;
  confidence: number;
}

export interface TimelineEvent {
  node_id: string;
  question: string;
  probability: number;
  temporal: TemporalEstimate;
  themes: string[];
}

export interface TimelinePhase {
  name: string;
  events: string[];
  summary: string;
}

export interface TimelineResult {
  events: TimelineEvent[];
  phases: TimelinePhase[];
  timestamp: string;
  token_usage: { input: number; output: number };
}

const ONSET_ORDER: Record<string, number> = {
  days: 1,
  weeks: 7,
  months: 30,
  quarters: 90,
  years: 365,
};

/**
 * Extract temporal estimates from each completed node, then assemble
 * into a phased timeline.
 */
export async function runTimelineAnalysis(): Promise<TimelineResult> {
  const nodes = getAllNodes();
  const completed = nodes.filter(
    (n) => n.status === "complete" && n.summary
  );

  if (completed.length === 0) {
    return {
      events: [],
      phases: [],
      timestamp: new Date().toISOString(),
      token_usage: { input: 0, output: 0 },
    };
  }

  let totalInput = 0;
  let totalOutput = 0;

  // Extract temporal estimates — batch nodes to reduce LLM calls
  const events: TimelineEvent[] = [];
  const batchSize = 10;

  for (let i = 0; i < completed.length; i += batchSize) {
    const batch = completed.slice(i, i + batchSize);
    const { extracted, token_usage } = await extractTemporalBatch(batch);
    events.push(...extracted);
    totalInput += token_usage.input;
    totalOutput += token_usage.output;
    trackTokens(token_usage.input, token_usage.output);
  }

  // Sort by onset
  events.sort((a, b) => {
    const aOrder = (ONSET_ORDER[a.temporal.onset] || 30) * a.temporal.onset_value;
    const bOrder = (ONSET_ORDER[b.temporal.onset] || 30) * b.temporal.onset_value;
    return aOrder - bOrder;
  });

  // Group into phases
  const phases = buildPhases(events);

  // Generate phase summaries
  const { phases: summarizedPhases, token_usage: summaryUsage } =
    await generatePhaseSummaries(phases, events, completed);
  totalInput += summaryUsage.input;
  totalOutput += summaryUsage.output;
  trackTokens(summaryUsage.input, summaryUsage.output);

  logActivity(
    "research_completed",
    `Timeline extracted: ${events.length} events across ${summarizedPhases.length} phases`
  );

  return {
    events,
    phases: summarizedPhases,
    timestamp: new Date().toISOString(),
    token_usage: { input: totalInput, output: totalOutput },
  };
}

async function extractTemporalBatch(
  nodes: QuestionNode[]
): Promise<{
  extracted: TimelineEvent[];
  token_usage: { input: number; output: number };
}> {
  const nodeList = nodes
    .map(
      (n, i) =>
        `${i + 1}. [${n.id}] "${n.question}"\n   Summary: ${n.summary?.slice(0, 300) || "N/A"}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `For each research finding below, estimate WHEN the described effect would manifest and how long it would last. Consider the causal chain — some effects are immediate, others take months to materialize.

${nodeList}

Return a JSON array (no markdown fences):
[
  {
    "node_id": "the-uuid",
    "onset": "days|weeks|months|quarters|years",
    "onset_value": 2,
    "duration": "transient|sustained|permanent",
    "peak_window": "2-6 weeks",
    "confidence": 0.6,
    "themes": ["energy", "markets"]
  }
]

Guidelines:
- onset: when does this effect FIRST become noticeable?
- onset_value: approximately how many of that unit (e.g., 3 weeks)
- duration: transient = resolves within weeks, sustained = lasts months to years, permanent = structural change
- peak_window: human-readable string for when the effect is strongest
- themes: 1-3 broad categories from: energy, markets, diplomacy, military, humanitarian, technology, environment, social
- confidence: how confident in the timing estimate (0-1)`,
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
    const events: TimelineEvent[] = parsed.map((item: any) => {
      const node = nodes.find((n) => n.id === item.node_id);
      return {
        node_id: item.node_id,
        question: node?.question || "",
        probability: node?.probability || 0.5,
        temporal: {
          onset: item.onset,
          onset_value: item.onset_value,
          duration: item.duration,
          peak_window: item.peak_window,
          confidence: item.confidence,
        },
        themes: item.themes || [],
      };
    });
    return { extracted: events, token_usage: usage };
  } catch {
    return { extracted: [], token_usage: usage };
  }
}

function buildPhases(events: TimelineEvent[]): TimelinePhase[] {
  const phases: TimelinePhase[] = [
    { name: "Immediate (Days)", events: [], summary: "" },
    { name: "Short-term (Weeks)", events: [], summary: "" },
    { name: "Medium-term (Months)", events: [], summary: "" },
    { name: "Long-term (Quarters+)", events: [], summary: "" },
  ];

  for (const event of events) {
    const days =
      (ONSET_ORDER[event.temporal.onset] || 30) * event.temporal.onset_value;

    if (days <= 7) {
      phases[0].events.push(event.node_id);
    } else if (days <= 42) {
      phases[1].events.push(event.node_id);
    } else if (days <= 180) {
      phases[2].events.push(event.node_id);
    } else {
      phases[3].events.push(event.node_id);
    }
  }

  return phases.filter((p) => p.events.length > 0);
}

async function generatePhaseSummaries(
  phases: TimelinePhase[],
  events: TimelineEvent[],
  nodes: QuestionNode[]
): Promise<{
  phases: TimelinePhase[];
  token_usage: { input: number; output: number };
}> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const phaseDescriptions = phases
    .map((phase) => {
      const phaseEvents = phase.events
        .map((id) => {
          const event = events.find((e) => e.node_id === id);
          const node = nodeMap.get(id);
          return `- "${node?.question.slice(0, 80)}" (P=${node?.probability.toFixed(2)}, peak: ${event?.temporal.peak_window})`;
        })
        .join("\n");
      return `### ${phase.name}\n${phaseEvents}`;
    })
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Write a 2-3 sentence summary for each phase of this cascade timeline. Focus on the dominant dynamics and how each phase flows into the next.

${phaseDescriptions}

Return a JSON array (no markdown fences):
[{"phase": "Phase Name", "summary": "2-3 sentence summary"}]`,
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
    const summarized = phases.map((phase) => {
      const match = parsed.find(
        (p: any) => p.phase === phase.name || phase.name.includes(p.phase)
      );
      return { ...phase, summary: match?.summary || "" };
    });
    return { phases: summarized, token_usage: usage };
  } catch {
    return { phases, token_usage: usage };
  }
}

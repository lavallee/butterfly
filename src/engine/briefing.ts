import Anthropic from "@anthropic-ai/sdk";
import type {
  QuestionNode,
  EntityCluster,
  AuditResult,
  Briefing,
  BriefingSection,
} from "@/types";
import { getAllNodes, logActivity } from "@/lib/db";
import { trackTokens } from "./budget";

const client = new Anthropic();

// Map entity types to broad themes
const THEME_KEYWORDS: Record<string, string[]> = {
  "Energy & Commodities": ["oil", "gas", "lng", "energy", "fuel", "opec", "crude", "petroleum", "coal", "renewable"],
  "Financial Markets": ["market", "stock", "bond", "currency", "inflation", "gdp", "trade", "tariff", "price", "cost", "economic"],
  "Diplomacy & Geopolitics": ["diplomatic", "treaty", "alliance", "sanction", "negotiation", "un", "nato", "sovereignty"],
  "Military & Security": ["military", "defense", "weapon", "conflict", "navy", "missile", "deterrence", "escalation"],
  "Humanitarian & Social": ["refugee", "humanitarian", "migration", "food", "health", "population", "civilian"],
  "Technology & Infrastructure": ["technology", "infrastructure", "shipping", "pipeline", "cyber", "supply chain", "logistics"],
};

/**
 * Generate an executive briefing from entity clusters and audit results.
 */
export async function generateBriefing(
  entityClusters: EntityCluster[],
  auditResult: AuditResult
): Promise<Briefing> {
  const nodes = getAllNodes().filter((n) => n.status === "complete" && n.summary);

  if (nodes.length === 0) {
    return {
      title: "No Research Completed",
      executive_summary: "No completed research nodes to synthesize.",
      sections: [],
      methodology_note: "No data available.",
      generated_at: new Date().toISOString(),
    };
  }

  // Group nodes by theme
  const themes = assignThemes(nodes, entityClusters);

  // Build the prompt sections
  const themeSections = Array.from(themes.entries())
    .map(([theme, themeNodes]) => {
      const nodeDescriptions = themeNodes
        .map(
          (n) =>
            `- "${n.question}" | P=${n.probability.toFixed(2)} C=${n.confidence.toFixed(2)}\n  Summary: ${n.summary?.slice(0, 300) || "N/A"}`
        )
        .join("\n");
      const themeEntities = entityClusters
        .filter((c) => c.node_ids.some((id) => themeNodes.find((n) => n.id === id)))
        .slice(0, 10)
        .map((c) => c.entity.name);
      return `### ${theme}\nEntities: ${themeEntities.join(", ") || "none"}\n${nodeDescriptions}`;
    })
    .join("\n\n");

  const auditSummary =
    auditResult.findings.length > 0
      ? auditResult.findings
          .slice(0, 8)
          .map((f) => `- [${f.severity}] ${f.type}: ${f.description}`)
          .join("\n")
      : "No significant findings.";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a senior intelligence analyst producing an executive briefing from a cascading effects research graph. Write clearly and precisely. Include specific probabilities and name key actors/entities.

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Generate an executive briefing from this research graph analysis.

**Research Summary (${nodes.length} completed analyses):**

${themeSections}

**Audit Findings:**
${auditSummary}

**Top Entity Clusters (by cross-reference count):**
${entityClusters
  .slice(0, 15)
  .map((c) => `- ${c.entity.name} (${c.entity.type}) — referenced in ${c.node_ids.length} analyses`)
  .join("\n")}

Produce a JSON object (no markdown fences):
{
  "title": "Brief descriptive title for this briefing",
  "executive_summary": "2-3 paragraph overview synthesizing the most important findings, key probability estimates, and their implications. This should read as a standalone summary.",
  "sections": [
    {
      "theme": "Theme Name",
      "summary": "2-3 paragraph synthesis of this theme's findings",
      "key_findings": ["Finding 1 with specific data", "Finding 2..."],
      "probability_table": [
        {"question": "Short question text", "probability": 0.75, "confidence": 0.6, "node_id": ""}
      ],
      "entities": ["Entity1", "Entity2"]
    }
  ],
  "methodology_note": "1-2 sentences on graph size, average confidence, and key caveats"
}

For the probability_table, use the actual probability and confidence values from the research. Leave node_id as empty string.
Group into 3-6 thematic sections. Focus on actionable insights and cross-cutting implications.`,
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

    // Map probability table entries back to actual node IDs where possible
    const briefing: Briefing = {
      ...parsed,
      generated_at: new Date().toISOString(),
      token_usage: usage,
      sections: (parsed.sections || []).map((s: any) => ({
        ...s,
        probability_table: (s.probability_table || []).map((row: any) => {
          const match = nodes.find(
            (n) =>
              n.question.toLowerCase().includes(row.question.toLowerCase().slice(0, 30))
          );
          return { ...row, node_id: match?.id || "" };
        }),
      })),
    };

    logActivity(
      "research_completed",
      `Briefing generated: "${briefing.title}" with ${briefing.sections.length} sections`
    );

    return briefing;
  } catch {
    return {
      title: "Briefing Generation Failed",
      executive_summary: text.slice(0, 2000),
      sections: [],
      methodology_note: "Failed to parse structured briefing from LLM response.",
      generated_at: new Date().toISOString(),
      token_usage: usage,
    };
  }
}

/**
 * Assign nodes to themes based on entity types and keyword matching.
 */
function assignThemes(
  nodes: QuestionNode[],
  clusters: EntityCluster[]
): Map<string, QuestionNode[]> {
  const themes = new Map<string, QuestionNode[]>();

  for (const node of nodes) {
    const text = `${node.question} ${node.summary || ""}`.toLowerCase();
    let bestTheme = "Other";
    let bestScore = 0;

    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestTheme = theme;
      }
    }

    const existing = themes.get(bestTheme) || [];
    existing.push(node);
    themes.set(bestTheme, existing);
  }

  return themes;
}

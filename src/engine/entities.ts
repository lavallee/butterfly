import Anthropic from "@anthropic-ai/sdk";
import type { QuestionNode, Edge, Entity, EntityCluster } from "@/types";
import { getAllNodes, getAllEdges, upsertNode, logActivity } from "@/lib/db";
import { trackTokens } from "./budget";

const client = new Anthropic();

/**
 * Extract entities from a single node's summary.
 */
export async function extractEntities(
  node: QuestionNode
): Promise<{ entities: Entity[]; token_usage: { input: number; output: number } }> {
  if (!node.summary) return { entities: [], token_usage: { input: 0, output: 0 } };

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract all named entities from this research summary. Include countries, organizations, people, commodities, and policies.

**Question context:** ${node.question}

**Summary:**
${node.summary}

Return a JSON array (no markdown fences):
[{"name": "Entity Name", "type": "country|organization|person|commodity|policy|other", "mentions": 1}]

Be thorough — include every distinct entity mentioned. Normalize names (e.g., "US" and "United States" should be "United States"). Set mentions to the approximate count of references in the summary.`,
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
    const entities: Entity[] = JSON.parse(text);
    return { entities, token_usage: usage };
  } catch {
    return { entities: [], token_usage: usage };
  }
}

/**
 * Extract entities for all completed nodes that don't have them yet.
 */
export async function extractAllEntities(): Promise<{
  extracted: number;
  token_usage: { input: number; output: number };
}> {
  const nodes = getAllNodes();
  const needsExtraction = nodes.filter(
    (n) => n.status === "complete" && n.summary && n.entities.length === 0
  );

  let totalInput = 0;
  let totalOutput = 0;

  for (const node of needsExtraction) {
    const { entities, token_usage } = await extractEntities(node);
    trackTokens(token_usage.input, token_usage.output);
    totalInput += token_usage.input;
    totalOutput += token_usage.output;

    node.entities = entities;
    node.updated_at = new Date().toISOString();
    upsertNode(node);

    logActivity(
      "research_completed",
      `Extracted ${entities.length} entities from "${node.question.slice(0, 60)}..."`,
      node.id
    );
  }

  return {
    extracted: needsExtraction.length,
    token_usage: { input: totalInput, output: totalOutput },
  };
}

/**
 * Build entity clusters — group entities by normalized name across all nodes.
 */
export function buildEntityClusters(nodes: QuestionNode[]): EntityCluster[] {
  const map = new Map<string, { entity: Entity; node_ids: Set<string> }>();

  for (const node of nodes) {
    for (const entity of node.entities) {
      const key = entity.name.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.node_ids.add(node.id);
        existing.entity.mentions += entity.mentions;
      } else {
        map.set(key, {
          entity: { ...entity },
          node_ids: new Set([node.id]),
        });
      }
    }
  }

  return Array.from(map.values())
    .map((v) => ({ entity: v.entity, node_ids: Array.from(v.node_ids) }))
    .sort((a, b) => b.node_ids.length - a.node_ids.length);
}

/**
 * Propose new edges between nodes that share entities but aren't connected.
 */
export function proposeEntityEdges(
  nodes: QuestionNode[],
  existingEdges: Edge[]
): { source_id: string; target_id: string; relationship: Edge["relationship"]; reason: string }[] {
  const connectedPairs = new Set<string>();
  for (const e of existingEdges) {
    connectedPairs.add(`${e.source_id}:${e.target_id}`);
    connectedPairs.add(`${e.target_id}:${e.source_id}`);
  }

  const completedNodes = nodes.filter(
    (n) => n.status === "complete" && n.entities.length > 0
  );
  const proposals: {
    source_id: string;
    target_id: string;
    relationship: Edge["relationship"];
    reason: string;
  }[] = [];

  for (let i = 0; i < completedNodes.length; i++) {
    for (let j = i + 1; j < completedNodes.length; j++) {
      const a = completedNodes[i];
      const b = completedNodes[j];

      if (connectedPairs.has(`${a.id}:${b.id}`)) continue;

      const aNames = new Set(a.entities.map((e) => e.name.toLowerCase()));
      const bNames = new Set(b.entities.map((e) => e.name.toLowerCase()));
      const shared = [...aNames].filter((n) => bNames.has(n));

      if (shared.length >= 2) {
        proposals.push({
          source_id: a.id,
          target_id: b.id,
          relationship: "amplifies",
          reason: `Shared entities: ${shared.join(", ")}`,
        });
      }
    }
  }

  return proposals;
}

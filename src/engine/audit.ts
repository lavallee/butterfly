import Anthropic from "@anthropic-ai/sdk";
import type { QuestionNode, Edge, AuditResult, AuditFinding } from "@/types";
import { getAllNodes, getAllEdges, logActivity } from "@/lib/db";
import { trackTokens } from "./budget";

const client = new Anthropic();
const CHUNK_SIZE = 50;

/**
 * Audit the full research graph for contradictions, probability tensions,
 * and unexplored gaps.
 */
export async function auditGraph(): Promise<AuditResult> {
  const nodes = getAllNodes().filter((n) => n.status === "complete" && n.summary);
  const edges = getAllEdges();

  if (nodes.length === 0) {
    return { findings: [], timestamp: new Date().toISOString() };
  }

  let allFindings: AuditFinding[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  if (nodes.length <= CHUNK_SIZE) {
    const result = await auditChunk(nodes, edges);
    allFindings = result.findings;
    totalInput = result.token_usage.input;
    totalOutput = result.token_usage.output;
  } else {
    // Chunk by depth bands with overlap
    const chunks = chunkByDepth(nodes, edges, CHUNK_SIZE);
    for (const chunk of chunks) {
      const result = await auditChunk(chunk.nodes, chunk.edges);
      allFindings.push(...result.findings);
      totalInput += result.token_usage.input;
      totalOutput += result.token_usage.output;
    }
    // Deduplicate findings that may appear in overlapping chunks
    allFindings = deduplicateFindings(allFindings);
  }

  trackTokens(totalInput, totalOutput);

  logActivity(
    "research_completed",
    `Audit found ${allFindings.length} findings (${allFindings.filter((f) => f.severity === "high").length} high severity)`
  );

  return {
    findings: allFindings,
    timestamp: new Date().toISOString(),
    token_usage: { input: totalInput, output: totalOutput },
  };
}

async function auditChunk(
  nodes: QuestionNode[],
  edges: Edge[]
): Promise<{ findings: AuditFinding[]; token_usage: { input: number; output: number } }> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const relevantEdges = edges.filter(
    (e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id)
  );

  const nodeList = nodes
    .map(
      (n, i) =>
        `${i + 1}. [${n.id.slice(0, 8)}] "${n.question}" | P=${n.probability.toFixed(2)} | C=${n.confidence.toFixed(2)} | ${n.summary?.slice(0, 200) || "No summary"}`
    )
    .join("\n");

  const edgeList = relevantEdges
    .map((e) => {
      const src = nodes.find((n) => n.id === e.source_id);
      const tgt = nodes.find((n) => n.id === e.target_id);
      return `- "${src?.question.slice(0, 50)}" --${e.relationship}--> "${tgt?.question.slice(0, 50)}" (strength ${e.strength})`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You are a meta-analyst auditing a research graph for internal consistency. Be rigorous and specific. Reference nodes by their ID prefix (first 8 chars).

Current date: ${new Date().toISOString().split("T")[0]}`,
    messages: [
      {
        role: "user",
        content: `Audit this research graph for consistency issues.

**Nodes:**
${nodeList}

**Edges:**
${edgeList || "No edges between these nodes."}

Find:
1. CONTRADICTIONS: Nodes whose findings or probability estimates directly conflict
2. PROBABILITY TENSIONS: Parent-child pairs where the probabilities don't make causal sense (e.g., a "causes" edge from P=0.3 parent to P=0.8 child)
3. GAPS: Important second/third-order consequences that no existing node addresses
4. STALE DEPENDENCIES: Completed nodes that rely on low-confidence or contradicted parents

Return a JSON object (no markdown fences):
{
  "findings": [
    {
      "type": "contradiction|probability_tension|gap|stale_dependency",
      "severity": "high|medium|low",
      "description": "Specific description of the issue",
      "involved_node_ids": ["first-8-chars-of-id", ...],
      "suggestion": {
        "type": "adjust_probability|new_edge|new_question",
        "detail": "What should be done",
        "node_id": "for probability adjustments - the node to adjust",
        "suggested_probability": 0.5,
        "source_id": "for new edges",
        "target_id": "for new edges",
        "relationship": "causes|enables|prevents|amplifies|weakens",
        "question": "for new questions to fill gaps"
      }
    }
  ]
}

Focus on the most impactful findings. Limit to 10 findings max.`,
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
    // Expand short IDs back to full IDs
    const findings: AuditFinding[] = (parsed.findings || []).map(
      (f: any) => ({
        ...f,
        involved_node_ids: (f.involved_node_ids || []).map(
          (shortId: string) =>
            nodes.find((n) => n.id.startsWith(shortId))?.id || shortId
        ),
        suggestion: {
          ...f.suggestion,
          node_id: f.suggestion?.node_id
            ? nodes.find((n) => n.id.startsWith(f.suggestion.node_id))?.id ||
              f.suggestion.node_id
            : undefined,
          source_id: f.suggestion?.source_id
            ? nodes.find((n) => n.id.startsWith(f.suggestion.source_id))?.id ||
              f.suggestion.source_id
            : undefined,
          target_id: f.suggestion?.target_id
            ? nodes.find((n) => n.id.startsWith(f.suggestion.target_id))?.id ||
              f.suggestion.target_id
            : undefined,
        },
      })
    );
    return { findings, token_usage: usage };
  } catch {
    return { findings: [], token_usage: usage };
  }
}

function chunkByDepth(
  nodes: QuestionNode[],
  edges: Edge[],
  chunkSize: number
): { nodes: QuestionNode[]; edges: Edge[] }[] {
  const sorted = [...nodes].sort((a, b) => a.depth - b.depth);
  const chunks: { nodes: QuestionNode[]; edges: Edge[] }[] = [];
  const overlap = 5;

  for (let i = 0; i < sorted.length; i += chunkSize - overlap) {
    const chunkNodes = sorted.slice(i, i + chunkSize);
    const nodeIds = new Set(chunkNodes.map((n) => n.id));
    const chunkEdges = edges.filter(
      (e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id)
    );
    chunks.push({ nodes: chunkNodes, edges: chunkEdges });
    if (i + chunkSize >= sorted.length) break;
  }

  return chunks;
}

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.type}:${f.involved_node_ids.sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

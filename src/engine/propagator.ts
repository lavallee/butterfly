import type { QuestionNode, Edge } from "@/types";

/**
 * When a node's probability changes, propagate the effect through the graph.
 *
 * The model: each edge represents a conditional influence. If node A "causes" node B
 * with strength 0.7, then B's probability is influenced by A's probability * 0.7.
 *
 * A node with multiple parents combines their influences. We use a noisy-OR model:
 * P(child) = 1 - ∏(1 - P(parent_i) * strength_i * direction_i)
 *
 * Where direction_i is +1 for causes/enables/amplifies, -1 for prevents/weakens.
 * "prevents" relationships reduce probability instead of increasing it.
 */

const RELATIONSHIP_DIRECTION: Record<string, number> = {
  causes: 1,
  enables: 0.7,
  amplifies: 0.5,
  prevents: -1,
  weakens: -0.5,
};

export function propagate(
  changedNodeId: string,
  nodes: QuestionNode[],
  edges: Edge[]
): QuestionNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
  const visited = new Set<string>();
  const queue = [changedNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Find all children of this node
    const childEdges = edges.filter((e) => e.source_id === currentId);

    for (const edge of childEdges) {
      const child = nodeMap.get(edge.target_id);
      if (!child) continue;

      // Only propagate to nodes that haven't been directly researched recently,
      // or where our computed probability differs significantly
      if (child.status === "complete" && child.confidence > 0.7) continue;

      // Gather all parent influences on this child
      const parentEdges = edges.filter((e) => e.target_id === child.id);
      const newProb = computeInfluencedProbability(child, parentEdges, nodeMap);

      // Only update if the change is meaningful (>5% shift)
      if (Math.abs(newProb - child.probability) > 0.05) {
        child.probability = newProb;
        child.updated_at = new Date().toISOString();

        // If the shift is large, mark as stale for re-research
        if (Math.abs(newProb - child.probability) > 0.15 && child.status === "complete") {
          child.status = "stale";
        }

        queue.push(child.id);
      }
    }
  }

  return Array.from(nodeMap.values());
}

function computeInfluencedProbability(
  node: QuestionNode,
  parentEdges: Edge[],
  nodeMap: Map<string, QuestionNode>
): number {
  if (parentEdges.length === 0) return node.probability;

  // Separate positive and negative influences
  let positiveInfluences: number[] = [];
  let negativeInfluences: number[] = [];

  for (const edge of parentEdges) {
    const parent = nodeMap.get(edge.source_id);
    if (!parent) continue;

    const direction = RELATIONSHIP_DIRECTION[edge.relationship] ?? 0;
    const influence = parent.probability * edge.strength * Math.abs(direction);

    if (direction >= 0) {
      positiveInfluences.push(influence);
    } else {
      negativeInfluences.push(influence);
    }
  }

  // Noisy-OR for positive influences
  const positiveProb =
    positiveInfluences.length > 0
      ? 1 - positiveInfluences.reduce((acc, p) => acc * (1 - p), 1)
      : node.probability;

  // Reduce by negative influences
  const negativeReduction =
    negativeInfluences.length > 0
      ? negativeInfluences.reduce((acc, p) => acc * (1 - p), 1)
      : 1;

  return clamp(positiveProb * negativeReduction, 0.01, 0.99);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

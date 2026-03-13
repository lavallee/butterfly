import type { QuestionNode, Edge, Annotation, PriorityFactors } from "@/types";
import { computeVOI } from "./analysis/voi";

/**
 * The value system for deciding what to research next.
 *
 * Balances exploration (new branches) vs exploitation (deepening existing ones)
 * by scoring each open question across multiple dimensions.
 */

const WEIGHTS = {
  uncertainty: 0.15,
  impact: 0.15,
  voi: 0.30, // Value of Information — dominant factor
  novelty: 0.15,
  staleness: 0.08,
  user_interest: 0.12,
  depth_penalty: 0.05,
};

export function scoreAllNodes(
  nodes: QuestionNode[],
  edges: Edge[],
  annotations: Annotation[]
): QuestionNode[] {
  const openNodes = nodes.filter((n) => n.status === "open" || n.status === "stale");
  if (openNodes.length === 0) return [];

  // Compute VOI scores upfront for all open nodes
  const voiScores = new Map<string, number>();
  try {
    for (const node of openNodes) {
      const voi = computeVOI(node.id, nodes, edges);
      voiScores.set(node.id, voi.voi_score);
    }
  } catch {
    // VOI computation is best-effort
  }
  const maxVOI = Math.max(...voiScores.values(), 0.001);

  const scored = openNodes.map((node) => {
    const factors = computeFactors(node, nodes, edges, annotations, voiScores.get(node.id) || 0, maxVOI);
    const score =
      WEIGHTS.uncertainty * factors.uncertainty +
      WEIGHTS.impact * factors.impact +
      WEIGHTS.voi * factors.voi +
      WEIGHTS.novelty * factors.novelty +
      WEIGHTS.staleness * factors.staleness +
      WEIGHTS.user_interest * factors.user_interest -
      WEIGHTS.depth_penalty * factors.depth_penalty;

    return { ...node, priority_score: score };
  });

  return scored.sort((a, b) => b.priority_score - a.priority_score);
}

export function pickNext(
  nodes: QuestionNode[],
  edges: Edge[],
  annotations: Annotation[]
): QuestionNode | null {
  const scored = scoreAllNodes(nodes, edges, annotations);
  return scored[0] || null;
}

function computeFactors(
  node: QuestionNode,
  allNodes: QuestionNode[],
  edges: Edge[],
  annotations: Annotation[],
  voiScore: number,
  maxVOI: number
): PriorityFactors {
  // Uncertainty: inverse of confidence. Low confidence = high research value.
  const uncertainty = 1 - node.confidence;

  // Impact: count of all downstream descendants (transitive).
  const descendants = countDescendants(node.id, edges);
  const maxPossibleDescendants = Math.max(allNodes.length - 1, 1);
  const impact = Math.min(descendants / maxPossibleDescendants, 1);

  // Novelty: nodes with fewer or no children are less explored.
  const directChildren = edges.filter((e) => e.source_id === node.id).length;
  const novelty = directChildren === 0 ? 1.0 : 1.0 / (1 + directChildren);

  // Staleness: how long since this was last researched (normalized to days).
  const staleness = node.researched_at
    ? Math.min(daysSince(node.researched_at) / 7, 1) // caps at 1 week
    : 1.0; // never researched = maximally stale

  // User interest: annotations on or near this node signal importance.
  const nodeAnnotations = annotations.filter((a) => a.node_id === node.id);
  const parentIds = edges
    .filter((e) => e.target_id === node.id)
    .map((e) => e.source_id);
  const nearbyAnnotations = annotations.filter(
    (a) => a.node_id && parentIds.includes(a.node_id)
  );
  const interestScore = Math.min(
    (nodeAnnotations.length * 2 + nearbyAnnotations.length) / 5,
    1
  );

  // Depth penalty: slight preference for shallower nodes (breadth-first tendency).
  const maxDepth = Math.max(...allNodes.map((n) => n.depth), 1);
  const depth_penalty = node.depth / maxDepth;

  // VOI: normalized value of information score
  const voi = maxVOI > 0 ? voiScore / maxVOI : 0;

  return {
    uncertainty,
    impact,
    voi,
    novelty,
    staleness,
    user_interest: interestScore,
    depth_penalty,
  };
}

function countDescendants(nodeId: string, edges: Edge[]): number {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of edges) {
      if (edge.source_id === current && !visited.has(edge.target_id)) {
        visited.add(edge.target_id);
        queue.push(edge.target_id);
      }
    }
  }
  return visited.size;
}

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

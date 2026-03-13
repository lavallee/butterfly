import type { QuestionNode, Edge } from "@/types";
import { getAllNodes, getAllEdges } from "@/lib/db";

export interface ConvergencePath {
  path: string[];
  path_confidence: number;
}

export interface ConvergencePoint {
  target_node_id: string;
  target_question: string;
  independent_paths: ConvergencePath[];
  convergence_score: number;
  supporting_probability: number;
}

export interface DivergencePoint {
  node_ids: string[];
  description: string;
  tension_score: number;
}

export interface ConvergenceResult {
  convergences: ConvergencePoint[];
  divergences: DivergencePoint[];
  timestamp: string;
}

/**
 * Find nodes where multiple independent causal chains converge,
 * and nodes where chains diverge into contradictory conclusions.
 */
export function runConvergenceAnalysis(): ConvergenceResult {
  const nodes = getAllNodes();
  const edges = getAllEdges();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency: parent → children
  const childrenOf = new Map<string, Edge[]>();
  const parentsOf = new Map<string, Edge[]>();
  for (const edge of edges) {
    const c = childrenOf.get(edge.source_id) || [];
    c.push(edge);
    childrenOf.set(edge.source_id, c);

    const p = parentsOf.get(edge.target_id) || [];
    p.push(edge);
    parentsOf.set(edge.target_id, p);
  }

  // Find roots (no parents)
  const roots = nodes.filter(
    (n) => !edges.some((e) => e.target_id === n.id)
  );

  // Find all paths from any root to each node
  const allPathsTo = new Map<string, ConvergencePath[]>();

  function dfs(
    nodeId: string,
    currentPath: string[],
    pathConfidence: number
  ) {
    const children = childrenOf.get(nodeId) || [];
    for (const edge of children) {
      const newPath = [...currentPath, edge.target_id];
      const newConfidence = pathConfidence * edge.strength;

      // Store path to this child
      const existing = allPathsTo.get(edge.target_id) || [];
      existing.push({ path: newPath, path_confidence: newConfidence });
      allPathsTo.set(edge.target_id, existing);

      // Continue DFS (avoid cycles)
      if (!currentPath.includes(edge.target_id)) {
        dfs(edge.target_id, newPath, newConfidence);
      }
    }
  }

  for (const root of roots) {
    dfs(root.id, [root.id], 1.0);
  }

  // Find convergences: nodes with multiple independent paths
  const convergences: ConvergencePoint[] = [];

  for (const [nodeId, paths] of allPathsTo.entries()) {
    if (paths.length < 2) continue;

    // Filter to independent paths (share no intermediate nodes)
    const independent = filterIndependentPaths(paths);
    if (independent.length < 2) continue;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const avgConfidence =
      independent.reduce((s, p) => s + p.path_confidence, 0) /
      independent.length;

    convergences.push({
      target_node_id: nodeId,
      target_question: node.question,
      independent_paths: independent,
      convergence_score: independent.length * avgConfidence,
      supporting_probability:
        independent.reduce((s, p) => {
          const rootNode = nodeMap.get(p.path[0]);
          return s + (rootNode?.probability || 0.5) * p.path_confidence;
        }, 0) / independent.length,
    });
  }

  convergences.sort((a, b) => b.convergence_score - a.convergence_score);

  // Find divergences: sibling nodes with opposite probability directions
  const divergences: DivergencePoint[] = [];
  const completed = nodes.filter((n) => n.status === "complete");

  for (const node of nodes) {
    const children = (childrenOf.get(node.id) || [])
      .map((e) => nodeMap.get(e.target_id))
      .filter((n): n is QuestionNode => n != null && n.status === "complete");

    if (children.length < 2) continue;

    // Look for siblings with contradictory probabilities
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i];
        const b = children[j];

        // Check if they share entities but have opposing probabilities
        const aEntities = new Set(a.entities.map((e) => e.name.toLowerCase()));
        const bEntities = new Set(b.entities.map((e) => e.name.toLowerCase()));
        const shared = [...aEntities].filter((e) => bEntities.has(e));

        const probDiff = Math.abs(a.probability - b.probability);

        if (shared.length >= 1 && probDiff > 0.3) {
          divergences.push({
            node_ids: [a.id, b.id],
            description: `"${a.question.slice(0, 60)}..." (P=${a.probability.toFixed(2)}) vs "${b.question.slice(0, 60)}..." (P=${b.probability.toFixed(2)}) — shared entities: ${shared.join(", ")}`,
            tension_score: probDiff * shared.length,
          });
        }
      }
    }
  }

  divergences.sort((a, b) => b.tension_score - a.tension_score);

  return {
    convergences: convergences.slice(0, 20),
    divergences: divergences.slice(0, 10),
    timestamp: new Date().toISOString(),
  };
}

/**
 * From a set of paths, select a maximal subset where no two paths
 * share an intermediate node (first and last nodes can be shared).
 */
function filterIndependentPaths(paths: ConvergencePath[]): ConvergencePath[] {
  // Sort by confidence descending — greedily pick best paths first
  const sorted = [...paths].sort(
    (a, b) => b.path_confidence - a.path_confidence
  );
  const selected: ConvergencePath[] = [];
  const usedIntermediates = new Set<string>();

  for (const path of sorted) {
    // Intermediates = everything except first and last
    const intermediates = path.path.slice(1, -1);
    const conflicts = intermediates.some((id) => usedIntermediates.has(id));

    if (!conflicts) {
      selected.push(path);
      intermediates.forEach((id) => usedIntermediates.add(id));
    }
  }

  return selected;
}

import type { QuestionNode, Edge } from "@/types";
import { getAllNodes, getAllEdges } from "@/lib/db";
import { propagate } from "../propagator";

export interface VOIResult {
  node_id: string;
  question: string;
  voi_score: number;
  entropy_reduction_low: number;
  entropy_reduction_high: number;
  expected_entropy_reduction: number;
}

export interface VOIAnalysisResult {
  nodes: VOIResult[];
  current_graph_entropy: number;
  timestamp: string;
}

/**
 * Compute binary entropy for a single probability.
 */
function binaryEntropy(p: number): number {
  if (p <= 0.001 || p >= 0.999) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/**
 * Compute total graph entropy: sum of binary entropy across all nodes.
 */
export function computeGraphEntropy(nodes: QuestionNode[]): number {
  return nodes.reduce((sum, n) => sum + binaryEntropy(n.probability), 0);
}

/**
 * Compute Value of Information for a single node.
 *
 * Simulates resolving the node at P=0.1 (low) and P=0.9 (high),
 * propagates both scenarios, and measures expected entropy reduction.
 */
export function computeVOI(
  nodeId: string,
  nodes: QuestionNode[],
  edges: Edge[]
): VOIResult {
  const node = nodes.find((n) => n.id === nodeId)!;
  const currentEntropy = computeGraphEntropy(nodes);

  // Simulate resolving at P=0.1 (unlikely)
  const lowClone = nodes.map((n) => ({ ...n }));
  const lowTarget = lowClone.find((n) => n.id === nodeId)!;
  lowTarget.probability = 0.1;
  lowTarget.confidence = 0.95;
  const lowPropagated = propagate(nodeId, lowClone, edges);
  const entropyLow = computeGraphEntropy(lowPropagated);

  // Simulate resolving at P=0.9 (likely)
  const highClone = nodes.map((n) => ({ ...n }));
  const highTarget = highClone.find((n) => n.id === nodeId)!;
  highTarget.probability = 0.9;
  highTarget.confidence = 0.95;
  const highPropagated = propagate(nodeId, highClone, edges);
  const entropyHigh = computeGraphEntropy(highPropagated);

  // Weight by current probability:
  // E[entropy_after] = P(high) * entropy_high + P(low) * entropy_low
  const pHigh = node.probability;
  const pLow = 1 - node.probability;
  const expectedEntropyAfter = pHigh * entropyHigh + pLow * entropyLow;
  const expectedReduction = currentEntropy - expectedEntropyAfter;

  return {
    node_id: nodeId,
    question: node.question,
    voi_score: Math.max(0, expectedReduction),
    entropy_reduction_low: currentEntropy - entropyLow,
    entropy_reduction_high: currentEntropy - entropyHigh,
    expected_entropy_reduction: Math.max(0, expectedReduction),
  };
}

/**
 * Compute VOI for all open/stale nodes, sorted by score descending.
 */
export function computeAllVOI(): VOIAnalysisResult {
  const nodes = getAllNodes();
  const edges = getAllEdges();
  const openNodes = nodes.filter(
    (n) => n.status === "open" || n.status === "stale"
  );

  const results: VOIResult[] = openNodes.map((n) =>
    computeVOI(n.id, nodes, edges)
  );

  results.sort((a, b) => b.voi_score - a.voi_score);

  return {
    nodes: results,
    current_graph_entropy: computeGraphEntropy(nodes),
    timestamp: new Date().toISOString(),
  };
}

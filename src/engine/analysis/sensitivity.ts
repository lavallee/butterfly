import type { QuestionNode, Edge } from "@/types";
import { getAllNodes, getAllEdges } from "@/lib/db";
import { propagate } from "../propagator";

export interface SensitivityNode {
  node_id: string;
  question: string;
  current_probability: number;
  impact_score: number;
  affected_count: number;
  max_downstream_shift: number;
  direction: "amplifying" | "dampening";
}

export interface SensitivityResult {
  nodes: SensitivityNode[];
  timestamp: string;
}

const PERTURBATION = 0.2;

/**
 * For each completed node, perturb its probability ±0.2 and measure
 * total downstream impact via propagation.
 */
export function runSensitivityAnalysis(): SensitivityResult {
  const nodes = getAllNodes();
  const edges = getAllEdges();
  const completed = nodes.filter((n) => n.status === "complete");

  const results: SensitivityNode[] = [];

  for (const node of completed) {
    const upResult = simulatePerturbation(node, PERTURBATION, nodes, edges);
    const downResult = simulatePerturbation(node, -PERTURBATION, nodes, edges);

    // Use whichever direction had more impact
    const best = upResult.totalImpact >= downResult.totalImpact ? upResult : downResult;
    const direction =
      upResult.totalImpact >= downResult.totalImpact ? "amplifying" : "dampening";

    results.push({
      node_id: node.id,
      question: node.question,
      current_probability: node.probability,
      impact_score: best.totalImpact,
      affected_count: best.affectedCount,
      max_downstream_shift: best.maxShift,
      direction,
    });
  }

  // Sort by impact score descending
  results.sort((a, b) => b.impact_score - a.impact_score);

  return { nodes: results, timestamp: new Date().toISOString() };
}

function simulatePerturbation(
  target: QuestionNode,
  delta: number,
  originalNodes: QuestionNode[],
  edges: Edge[]
): { totalImpact: number; affectedCount: number; maxShift: number } {
  // Clone nodes and apply perturbation
  const cloned = originalNodes.map((n) => ({ ...n }));
  const clonedTarget = cloned.find((n) => n.id === target.id)!;
  clonedTarget.probability = clamp(clonedTarget.probability + delta, 0.01, 0.99);

  // Propagate from the perturbed node
  const propagated = propagate(target.id, cloned, edges);

  // Measure downstream changes
  let totalImpact = 0;
  let affectedCount = 0;
  let maxShift = 0;

  for (const pNode of propagated) {
    if (pNode.id === target.id) continue;
    const orig = originalNodes.find((n) => n.id === pNode.id);
    if (!orig) continue;

    const shift = Math.abs(pNode.probability - orig.probability);
    if (shift > 0.005) {
      totalImpact += shift;
      affectedCount++;
      maxShift = Math.max(maxShift, shift);
    }
  }

  return { totalImpact, affectedCount, maxShift };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

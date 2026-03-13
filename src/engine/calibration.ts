import type { QuestionNode, CalibrationBin, CalibrationData } from "@/types";
import { getNode, upsertNode, getAllNodes, logActivity, recordBeliefUpdate } from "@/lib/db";

/**
 * Resolve a question and compute its Brier score.
 */
export function resolveQuestion(
  nodeId: string,
  resolvedAs: "yes" | "no" | "partial"
): QuestionNode {
  const node = getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  const outcome = resolvedAs === "yes" ? 1 : resolvedAs === "no" ? 0 : 0.5;
  const brier = Math.pow(node.probability - outcome, 2);

  node.status = "resolved";
  node.resolved_at = new Date().toISOString();
  node.resolved_as = resolvedAs;
  node.brier_score = brier;
  node.updated_at = new Date().toISOString();
  upsertNode(node);

  recordBeliefUpdate(
    nodeId,
    node.probability,
    node.confidence,
    "resolution",
    `Resolved as "${resolvedAs}" — Brier: ${brier.toFixed(4)}`
  );

  logActivity(
    "research_completed",
    `Resolved "${node.question.slice(0, 60)}..." as ${resolvedAs} (Brier: ${brier.toFixed(4)})`,
    nodeId
  );

  return node;
}

/**
 * Compute calibration data across all resolved questions.
 */
export function computeCalibrationData(): CalibrationData {
  const nodes = getAllNodes();
  const resolved = nodes.filter((n) => n.resolved_as !== null);

  const bins: CalibrationBin[] = [];

  for (let i = 0; i < 10; i++) {
    const binStart = i / 10;
    const binEnd = (i + 1) / 10;

    const inBin = resolved.filter((n) => {
      const p = n.probability;
      return p >= binStart && (i === 9 ? p <= binEnd : p < binEnd);
    });

    if (inBin.length === 0) {
      bins.push({
        bin_start: binStart,
        bin_end: binEnd,
        predicted_avg: (binStart + binEnd) / 2,
        actual_rate: 0,
        count: 0,
        node_ids: [],
      });
      continue;
    }

    const predictedAvg =
      inBin.reduce((s, n) => s + n.probability, 0) / inBin.length;
    const actualRate =
      inBin.reduce((s, n) => {
        const outcome =
          n.resolved_as === "yes" ? 1 : n.resolved_as === "no" ? 0 : 0.5;
        return s + outcome;
      }, 0) / inBin.length;

    bins.push({
      bin_start: binStart,
      bin_end: binEnd,
      predicted_avg: predictedAvg,
      actual_rate: actualRate,
      count: inBin.length,
      node_ids: inBin.map((n) => n.id),
    });
  }

  const overallBrier =
    resolved.length > 0
      ? resolved.reduce((s, n) => s + (n.brier_score || 0), 0) /
        resolved.length
      : 0;

  return {
    bins,
    overall_brier: overallBrier,
    resolved_count: resolved.length,
    timestamp: new Date().toISOString(),
  };
}

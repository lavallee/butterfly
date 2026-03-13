import type { QuestionNode, Edge } from "@/types";
import { getAllNodes, getAllEdges } from "@/lib/db";

export interface MonteCarloNodeResult {
  node_id: string;
  question: string;
  point_estimate: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  credible_interval_width: number;
  mean: number;
  std_dev: number;
}

export interface MonteCarloCorrelation {
  node_a: string;
  node_b: string;
  correlation: number;
}

export interface MonteCarloResult {
  simulations: number;
  nodes: MonteCarloNodeResult[];
  correlations: MonteCarloCorrelation[];
  widest_intervals: string[];
  timestamp: string;
}

const DEFAULT_SIMULATIONS = 10000;

/**
 * Run Monte Carlo simulation over the research graph.
 *
 * Each node's probability is modeled as a Beta distribution parameterized
 * by its probability and confidence. Higher confidence = tighter distribution.
 *
 * For each simulation:
 * 1. Sample root/source nodes from their Beta distributions
 * 2. Propagate through the graph in topological order using noisy-OR
 * 3. Record resulting probability for every node
 *
 * Output: percentile distributions and correlations.
 */
export function runMonteCarloSimulation(
  numSimulations = DEFAULT_SIMULATIONS
): MonteCarloResult {
  const nodes = getAllNodes();
  const edges = getAllEdges();

  // Build adjacency and find topological order
  const sorted = topologicalSort(nodes, edges);
  const nodeIndex = new Map(sorted.map((n, i) => [n.id, i]));

  // Find parent edges for each node
  const parentEdgesOf = new Map<string, Edge[]>();
  for (const edge of edges) {
    const existing = parentEdgesOf.get(edge.target_id) || [];
    existing.push(edge);
    parentEdgesOf.set(edge.target_id, existing);
  }

  // Find root nodes (no parents in the edge set)
  const hasParent = new Set(edges.map((e) => e.target_id));
  const rootIds = new Set(sorted.filter((n) => !hasParent.has(n.id)).map((n) => n.id));

  // Run simulations — store results per node
  const samples: number[][] = sorted.map(() => []);

  for (let sim = 0; sim < numSimulations; sim++) {
    const sampled = new Map<string, number>();

    for (const node of sorted) {
      if (rootIds.has(node.id) || !(parentEdgesOf.get(node.id)?.length)) {
        // Sample from Beta distribution
        const p = sampleBeta(node.probability, node.confidence);
        sampled.set(node.id, p);
      } else {
        // Propagate from parents using noisy-OR
        const parentEdges = parentEdgesOf.get(node.id) || [];
        const p = computePropagated(node, parentEdges, sampled);
        sampled.set(node.id, p);
      }

      samples[nodeIndex.get(node.id)!].push(sampled.get(node.id)!);
    }
  }

  // Compute statistics
  const nodeResults: MonteCarloNodeResult[] = sorted.map((node, idx) => {
    const s = samples[idx];
    s.sort((a, b) => a - b);

    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const variance =
      s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length;

    const p5 = percentile(s, 0.05);
    const p25 = percentile(s, 0.25);
    const p50 = percentile(s, 0.5);
    const p75 = percentile(s, 0.75);
    const p95 = percentile(s, 0.95);

    return {
      node_id: node.id,
      question: node.question,
      point_estimate: node.probability,
      percentiles: { p5, p25, p50, p75, p95 },
      credible_interval_width: p95 - p5,
      mean,
      std_dev: Math.sqrt(variance),
    };
  });

  // Sort by credible interval width for widest_intervals
  const byWidth = [...nodeResults].sort(
    (a, b) => b.credible_interval_width - a.credible_interval_width
  );
  const widestIntervals = byWidth.slice(0, 5).map((n) => n.node_id);

  // Compute top correlations between completed nodes
  const completed = sorted.filter((n) => n.status === "complete");
  const correlations: MonteCarloCorrelation[] = [];

  // Only compute correlations for top nodes to keep it manageable
  const topNodes = completed.slice(0, 30);
  for (let i = 0; i < topNodes.length; i++) {
    for (let j = i + 1; j < topNodes.length; j++) {
      const idxA = nodeIndex.get(topNodes[i].id)!;
      const idxB = nodeIndex.get(topNodes[j].id)!;
      const corr = pearsonCorrelation(samples[idxA], samples[idxB]);

      if (Math.abs(corr) > 0.3) {
        correlations.push({
          node_a: topNodes[i].id,
          node_b: topNodes[j].id,
          correlation: corr,
        });
      }
    }
  }

  correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    simulations: numSimulations,
    nodes: nodeResults,
    correlations: correlations.slice(0, 20),
    widest_intervals: widestIntervals,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sample from a Beta distribution using the probability and confidence
 * to parameterize the shape.
 *
 * k controls concentration: higher confidence = tighter distribution.
 * k ranges from ~2 (very uncertain) to ~22 (very confident).
 */
function sampleBeta(probability: number, confidence: number): number {
  const k = confidence * 20 + 2;
  const alpha = probability * k;
  const beta = (1 - probability) * k;
  return betaSample(alpha, beta);
}

/**
 * Sample from Beta(alpha, beta) using the Gamma distribution method.
 */
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return clamp(x / (x + y), 0.001, 0.999);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia and Tsang's method.
 */
function gammaSample(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use shape+1 and then adjust
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform.
 */
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Topological sort of nodes based on edges.
 */
function topologicalSort(
  nodes: QuestionNode[],
  edges: Edge[]
): QuestionNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    children.set(node.id, []);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source_id) && nodeMap.has(edge.target_id)) {
      inDegree.set(edge.target_id, (inDegree.get(edge.target_id) || 0) + 1);
      children.get(edge.source_id)?.push(edge.target_id);
    }
  }

  const queue = nodes
    .filter((n) => (inDegree.get(n.id) || 0) === 0)
    .map((n) => n.id);
  const sorted: QuestionNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);

    for (const childId of children.get(id) || []) {
      const deg = (inDegree.get(childId) || 1) - 1;
      inDegree.set(childId, deg);
      if (deg === 0) queue.push(childId);
    }
  }

  // Add any nodes not reached (cycles or disconnected)
  for (const node of nodes) {
    if (!sorted.find((n) => n.id === node.id)) {
      sorted.push(node);
    }
  }

  return sorted;
}

const RELATIONSHIP_DIRECTION: Record<string, number> = {
  causes: 1,
  enables: 0.7,
  amplifies: 0.5,
  prevents: -1,
  weakens: -0.5,
};

/**
 * Compute propagated probability for a node using noisy-OR
 * (matches the logic in propagator.ts).
 */
function computePropagated(
  node: QuestionNode,
  parentEdges: Edge[],
  sampled: Map<string, number>
): number {
  const positiveInfluences: number[] = [];
  const negativeInfluences: number[] = [];

  for (const edge of parentEdges) {
    const parentP = sampled.get(edge.source_id);
    if (parentP == null) continue;

    const direction = RELATIONSHIP_DIRECTION[edge.relationship] ?? 0;
    const influence = parentP * edge.strength * Math.abs(direction);

    if (direction >= 0) {
      positiveInfluences.push(influence);
    } else {
      negativeInfluences.push(influence);
    }
  }

  // Also sample this node's own distribution and blend
  const ownSample = sampleBeta(node.probability, node.confidence);

  const positiveProb =
    positiveInfluences.length > 0
      ? 1 - positiveInfluences.reduce((acc, p) => acc * (1 - p), 1)
      : ownSample;

  const negativeReduction =
    negativeInfluences.length > 0
      ? negativeInfluences.reduce((acc, p) => acc * (1 - p), 1)
      : 1;

  return clamp(positiveProb * negativeReduction, 0.001, 0.999);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(p * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;

  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    sumAB += da * db;
    sumA2 += da * da;
    sumB2 += db * db;
  }

  const denom = Math.sqrt(sumA2 * sumB2);
  return denom === 0 ? 0 : sumAB / denom;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

import type { QuestionNode, Edge } from "@/types";
import { getAllNodes, getAllEdges } from "@/lib/db";
import { propagate } from "../propagator";

export interface WhatIfOverride {
  node_id: string;
  probability: number;
  confidence?: number;
}

export interface WhatIfScenario {
  name: string;
  overrides: WhatIfOverride[];
}

export interface WhatIfDiff {
  node_id: string;
  question: string;
  before: number;
  after: number;
  delta: number;
}

export interface WhatIfResult {
  scenario: WhatIfScenario;
  diffs: WhatIfDiff[];
  total_impact: number;
  most_affected: string;
  timestamp: string;
}

/**
 * Apply one or more probability overrides to the graph and propagate
 * changes to compute the full downstream impact.
 */
export function runWhatIfAnalysis(scenario: WhatIfScenario): WhatIfResult {
  const nodes = getAllNodes();
  const edges = getAllEdges();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Clone nodes and apply overrides
  let cloned = nodes.map((n) => ({ ...n }));

  for (const override of scenario.overrides) {
    const node = cloned.find((n) => n.id === override.node_id);
    if (!node) continue;
    node.probability = clamp(override.probability, 0.01, 0.99);
    if (override.confidence != null) {
      node.confidence = clamp(override.confidence, 0, 1);
    }
  }

  // Propagate from each overridden node
  for (const override of scenario.overrides) {
    cloned = propagate(override.node_id, cloned, edges);
  }

  // Compute diffs
  const diffs: WhatIfDiff[] = [];
  for (const clonedNode of cloned) {
    const orig = nodeMap.get(clonedNode.id);
    if (!orig) continue;

    const delta = clonedNode.probability - orig.probability;
    if (Math.abs(delta) > 0.005) {
      diffs.push({
        node_id: clonedNode.id,
        question: clonedNode.question,
        before: orig.probability,
        after: clonedNode.probability,
        delta,
      });
    }
  }

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const totalImpact = diffs.reduce((s, d) => s + Math.abs(d.delta), 0);
  const mostAffected = diffs[0]?.node_id || "";

  return {
    scenario,
    diffs,
    total_impact: totalImpact,
    most_affected: mostAffected,
    timestamp: new Date().toISOString(),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

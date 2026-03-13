# Butterfly v0.3 — Analysis Pipeline Spec

Advanced analysis capabilities that operate on the collected research graph.

---

## 1. Sensitivity Analysis

**Problem:** Not all assumptions carry equal weight. A small shift in one node's probability might cascade through 20 downstream nodes, while another node could swing wildly with no downstream effect. Users need to know which assumptions are load-bearing.

**Design:**
- For each completed node, simulate a perturbation: shift its probability by ±0.2 (clamped to 0.01–0.99)
- Propagate the shift through the graph using the existing noisy-OR propagator
- Measure the total downstream impact: sum of absolute probability changes across all affected nodes
- Rank nodes by total impact — these are the "linchpin" assumptions
- Output: a ranked list of nodes with their impact scores, plus a visualization-ready sensitivity map

**Output format:**
```typescript
interface SensitivityResult {
  nodes: {
    node_id: string;
    question: string;
    current_probability: number;
    impact_score: number;        // sum of |ΔP| across all downstream nodes
    affected_count: number;      // how many nodes shifted > 0.01
    max_downstream_shift: number; // largest single-node shift
    direction: "amplifying" | "dampening"; // does increasing P amplify or dampen the system?
  }[];
  timestamp: string;
}
```

**Implementation:** Pure graph computation — no LLM calls. Add `engine/analysis/sensitivity.ts`. Uses `propagator.ts` internally with temporary node copies (never writes to DB). O(N²) where N = completed nodes, but N < 200 is fine.

---

## 2. Convergence Detection

**Problem:** The most reliable predictions are those arrived at through multiple independent causal chains. If three separate branches of research all point toward the same outcome, that's much stronger than a single chain. Currently there's no way to see this.

**Design:**
- Identify "terminal" or "leaf" nodes — nodes with no children, or nodes that represent concrete outcomes
- For each terminal node, trace all paths back to the root(s)
- If multiple paths arrive at the same node (or semantically similar nodes via entity overlap), that's convergence
- Score convergence strength: number of independent paths × average path confidence
- Also detect divergence: nodes where causal chains lead to contradictory conclusions

**Output format:**
```typescript
interface ConvergenceResult {
  convergences: {
    target_node_id: string;
    target_question: string;
    independent_paths: {
      path: string[];  // node IDs from root to target
      path_confidence: number; // product of edge strengths along path
    }[];
    convergence_score: number;
    supporting_probability: number; // weighted average P across paths
  }[];
  divergences: {
    node_ids: string[];
    description: string;
    tension_score: number;
  }[];
  timestamp: string;
}
```

**Implementation:** Pure graph traversal. Add `engine/analysis/convergence.ts`. BFS/DFS from roots, tracking path independence (paths are independent if they share no intermediate nodes). For semantic similarity on divergence detection, reuse entity overlap from `entities.ts`.

---

## 3. What-If Scenarios

**Problem:** The graph represents one version of reality — the engine's best estimates. But users want to ask "what if this assumption is wrong?" or "what if this event happens sooner/later?" and see how the entire picture shifts.

**Design:**
- User specifies an override: a node ID + new probability (and optionally new confidence)
- System creates a virtual fork of the graph — no DB writes
- Propagates the override through the full graph
- Returns a diff: every node whose probability shifted, with before/after values
- Support multiple simultaneous overrides (e.g., "oil prices drop AND diplomatic solution found")
- The UI shows the diff as a colored overlay on the canvas: green for nodes that improved, red for nodes that worsened

**Output format:**
```typescript
interface WhatIfScenario {
  name: string;
  overrides: { node_id: string; probability: number; confidence?: number }[];
}

interface WhatIfResult {
  scenario: WhatIfScenario;
  diffs: {
    node_id: string;
    question: string;
    before: number;
    after: number;
    delta: number;
  }[];
  total_impact: number;  // sum of |delta|
  most_affected: string; // node_id with largest |delta|
  timestamp: string;
}
```

**Implementation:** Pure graph computation. Add `engine/analysis/whatif.ts`. Clone all nodes in memory, apply overrides, run full propagation, diff against original. UI: new `WhatIfPanel` component with input fields for overrides, results shown as a table + canvas overlay.

---

## 4. Stakeholder Influence Map

**Problem:** Entities are extracted but not analyzed for influence patterns. Which actors have the most leverage? Which ones appear at critical junctures in the causal graph? Understanding actor concentration reveals political and strategic dynamics.

**Design:**
- For each entity, compute:
  - **Reach:** number of nodes it appears in
  - **Causal weight:** sum of probability × confidence of nodes it appears in
  - **Centrality:** average betweenness centrality of the nodes it appears in
  - **Domain spread:** number of distinct themes/branches it spans
- Generate an influence ranking
- Identify entity co-occurrence patterns: which actors always appear together? Which never do?
- An LLM call synthesizes the entity analysis into a stakeholder narrative

**Output format:**
```typescript
interface StakeholderResult {
  actors: {
    entity: Entity;
    reach: number;
    causal_weight: number;
    centrality: number;
    domain_spread: number;
    influence_score: number; // weighted composite
    key_nodes: string[];    // most important node IDs for this actor
  }[];
  co_occurrences: {
    entities: [string, string];
    count: number;
    relationship: string; // e.g., "allied", "opposing", "independent"
  }[];
  narrative: string; // LLM-generated stakeholder analysis
  timestamp: string;
}
```

**Implementation:** Graph computation + one LLM call for narrative. Add `engine/analysis/stakeholders.ts`. Entity data already exists on nodes. Betweenness centrality is O(V×E) — fine for our graph sizes.

---

## 5. Uncertainty Hotspots

**Problem:** The most dangerous nodes are those with high asserted probability but low confidence — the engine is making strong claims it can't well support. These need to be surfaced prominently.

**Design:**
- Compute a "risk score" for each node: `probability × (1 - confidence)`
  - High probability + low confidence = high risk (strong unsupported claim)
- Also flag: nodes where critic adjusted probability by > 0.15 (contested claims)
- Also flag: nodes with high downstream impact (from sensitivity analysis) AND low confidence
- Rank by composite danger score: `risk × downstream_impact`

**Output format:**
```typescript
interface UncertaintyResult {
  hotspots: {
    node_id: string;
    question: string;
    probability: number;
    confidence: number;
    risk_score: number;
    downstream_impact: number;
    danger_score: number;
    reason: string;
  }[];
  overall_confidence: number;  // graph-wide average confidence
  weakest_branch: string;      // branch (root child) with lowest avg confidence
  timestamp: string;
}
```

**Implementation:** Pure computation. Add `engine/analysis/uncertainty.ts`. Depends on sensitivity analysis output for `downstream_impact`. Quick to compute.

---

## 6. Timeline Extraction

**Problem:** The graph captures causal ordering (A causes B) but not temporal ordering (A happens in weeks, B happens in months). For a cascading effects analysis, knowing *when* effects materialize is critical for planning and response.

**Design:**
- One LLM call per completed node: extract temporal estimates from the summary
  - When does this effect begin? (days / weeks / months / quarters / years)
  - How long does it persist? (transient / sustained / permanent)
  - What's the peak impact window?
- Store temporal metadata on each node
- Assemble into a chronological cascade timeline
- Group by time horizon: immediate (days), short-term (weeks), medium-term (months), long-term (years)
- The timeline should show parallel tracks by domain/theme

**Output format:**
```typescript
interface TemporalEstimate {
  onset: string;           // "days" | "weeks" | "months" | "quarters" | "years"
  onset_value: number;     // e.g., 2 (weeks)
  duration: string;        // "transient" | "sustained" | "permanent"
  peak_window: string;     // e.g., "2-6 weeks"
  confidence: number;      // how confident in the timing estimate
}

interface TimelineResult {
  events: {
    node_id: string;
    question: string;
    probability: number;
    temporal: TemporalEstimate;
    themes: string[];
  }[];
  phases: {
    name: string;           // e.g., "Immediate Crisis (Days 1-7)"
    events: string[];       // node IDs
    summary: string;        // LLM-generated phase summary
  }[];
  timestamp: string;
  token_usage?: { input: number; output: number };
}
```

**Implementation:** LLM calls for extraction + one for phase summaries. Add `engine/analysis/timeline.ts`. Store `temporal_estimate` on nodes (new field, JSON-serialized). UI: new `TimelinePanel` component rendering a horizontal timeline grouped by phase. Add `temporal_estimate` to QuestionNode type and DB schema.

---

## 7. Monte Carlo Simulation

**Problem:** Point probability estimates give false precision. P=0.7 could mean "I'm fairly sure this happens" or "this is anywhere between 0.4 and 0.95." Confidence scores exist but aren't used to generate ranges. Monte Carlo simulation treats each node as a distribution, samples through the graph, and produces credible intervals.

**Design:**
- Model each node's probability as a Beta distribution parameterized by its probability and confidence
  - Higher confidence → tighter distribution around the stated probability
  - Lower confidence → wider distribution (more uncertainty)
  - Beta(α, β) where α = P × k, β = (1-P) × k, and k = confidence × 20 + 2 (so k ranges from 2.2 to 22)
- Run N simulations (default 10,000):
  - For each simulation, sample each root/independent node from its distribution
  - Propagate through the graph using the noisy-OR model with sampled probabilities
  - Record the resulting probability for every node
- Output: for each node, the 5th/25th/50th/75th/95th percentile probabilities
- Also compute: which nodes have the widest credible intervals (most uncertain outcomes)
- Also compute: correlation matrix — which nodes' outcomes are most correlated across simulations?

**Output format:**
```typescript
interface MonteCarloResult {
  simulations: number;
  nodes: {
    node_id: string;
    question: string;
    point_estimate: number;  // original probability
    percentiles: {
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    };
    credible_interval_width: number; // p95 - p5
    mean: number;
    std_dev: number;
  }[];
  correlations: {
    node_a: string;
    node_b: string;
    correlation: number; // Pearson correlation across simulations
  }[];
  widest_intervals: string[]; // top 5 node IDs by credible_interval_width
  timestamp: string;
}
```

**Implementation:** Pure computation — no LLM calls. Add `engine/analysis/montecarlo.ts`. Beta distribution sampling uses the inverse CDF (can be computed with a simple approximation or the jstat library). 10K simulations × 100 nodes = 1M samples, runs in <1 second. The propagation per simulation can be simplified (no BFS queue needed if we topologically sort the graph first).

**Key design decision:** Topological sort the graph once, then iterate in order for each simulation. This ensures parents are always sampled before children. O(N) per simulation instead of O(N²).

---

## 8. Network Centrality

**Problem:** Some nodes are structurally critical — they sit on every path between major domains — but their individual probability might not stand out. PageRank and betweenness centrality reveal the graph's backbone.

**Design:**
- Compute for each node:
  - **Betweenness centrality:** fraction of shortest paths between all node pairs that pass through this node
  - **In-degree / out-degree:** how many edges arrive/depart
  - **PageRank:** iterative importance score based on incoming edge weights
- Highlight "bridge" nodes: high betweenness but not directly connected to the root (they connect otherwise-separate domains)
- Overlay centrality as node size or glow intensity on the canvas

**Output format:**
```typescript
interface CentralityResult {
  nodes: {
    node_id: string;
    question: string;
    betweenness: number;
    pagerank: number;
    in_degree: number;
    out_degree: number;
    is_bridge: boolean;
  }[];
  bridges: string[];        // node IDs that connect otherwise-separate subgraphs
  timestamp: string;
}
```

**Implementation:** Pure graph computation. Add `engine/analysis/centrality.ts`. Standard algorithms — betweenness is O(V×E), PageRank is iterative (converges in ~20 iterations for our graph size). No external dependencies needed.

---

## Implementation Order

**Phase 1 — Build now (pure computation, high value):**
1. **Sensitivity Analysis** — identifies linchpin assumptions
2. **Convergence Detection** — finds highest-conviction predictions
3. **What-If Scenarios** — user-driven exploration

**Phase 2 — Build now (LLM-assisted, high value):**
4. **Timeline Extraction** — temporal dimension the graph currently lacks
5. **Monte Carlo Simulation** — proper uncertainty quantification

**Phase 3 — Build later:**
6. Uncertainty Hotspots — depends on sensitivity output
7. Stakeholder Influence Map — enriches entity analysis
8. Network Centrality — structural analysis

**Shared infrastructure:**
- All analysis results stored in `engine_state` as JSON (keyed by analysis type)
- New `/api/analysis` endpoint with `?type=sensitivity|convergence|whatif|timeline|montecarlo`
- New `AnalysisPanel` component (tabbed interface for viewing results)
- Analysis modules live under `engine/analysis/` directory

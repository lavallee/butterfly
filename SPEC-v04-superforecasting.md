# Butterfly v0.4 — Superforecasting Spec

Informed by Tetlock's superforecasting methodology, the Good Judgment Project, and calibration research.

---

## 1. Belief History (Update Tracking)

**Problem:** We have no record of how a node's probability evolved or why. Superforecasters obsess over their update trail — it reveals systematic biases (e.g., always anchoring too high, slow to update on disconfirming evidence).

**Design:**
- Every time a node's probability or confidence changes, record the update
- Each record: `{ timestamp, probability, confidence, trigger, detail }`
- Triggers: `research`, `critic`, `propagation`, `user`, `audit`, `resolution`
- Separate `belief_history` DB table with an index on `(node_id, timestamp)`
- UI: sparkline in the EvidencePanel showing P over time, color-coded dots by trigger type
- Compact update list below the sparkline

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS belief_history (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  timestamp TEXT NOT NULL,
  probability REAL NOT NULL,
  confidence REAL NOT NULL,
  trigger TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_belief_history_node ON belief_history(node_id, timestamp);
```

**Recording points in `loop.ts`:**
- After research result applied → trigger: "research"
- After critique adjustments → trigger: "critic"
- After propagation changes each node → trigger: "propagation"
- On user PATCH of probability → trigger: "user"
- On question resolution → trigger: "resolution"

**Implementation:** New table + functions in `db.ts`. Record calls inserted at each trigger point. New sparkline section in EvidencePanel.

---

## 2. Operationalization

**Problem:** Vague questions can't be scored. "Oil prices will spike" is unfalsifiable. Superforecasters convert every question into a precise, time-bound, measurable prediction before estimating probability.

**Design:**
- After a question is generated but before first research, run an LLM step
- Converts: "Oil prices will spike" → "Brent crude will exceed $130/barrel for at least 5 consecutive trading days before December 2026"
- Output: operationalized question, resolution criteria, resolution date
- The operationalized question is what gets researched and scored
- Users can edit the operationalized version via EvidencePanel
- One-time per node (skip if `operationalized_question` is already set)

**New fields on `QuestionNode`:**
- `operationalized_question: string | null`
- `resolution_criteria: string | null`
- `resolution_date: string | null`

**New module: `engine/operationalizer.ts`**

LLM prompt:
```
Convert this question into a precise, time-bound, measurable prediction.

Question: ${question}

Produce JSON:
{
  "operationalized_question": "Precise version with specific thresholds and timeframe",
  "resolution_criteria": "How to determine yes/no/partial — what data source, what threshold",
  "resolution_date": "YYYY-MM-DD when the outcome should be knowable"
}
```

**Integration into `loop.ts`:**
- After picking the target node, before research
- If `operationalized_question` is null, call `operationalize()`
- Update node with results, track tokens
- Pass operationalized question to researcher

---

## 3. Base Rate Module

**Problem:** Superforecasters always start with the outside view — "how often does this class of thing happen?" — before looking at case-specific evidence. Our researcher jumps straight to inside-view analysis, leading to overconfidence on rare events and under-confidence on common ones.

**Design:**
- Before the main research call, identify the reference class and historical base rate
- Inject the base rate into the researcher prompt as an anchor
- Store on the node for display
- One-time per node (skip if `base_rate` is already set)

**New field on `QuestionNode`:** `base_rate: number | null`

**New module: `engine/baserate.ts`**

LLM prompt:
```
You are a reference class forecasting specialist. Given this question about a future event,
identify the most appropriate reference class and estimate the historical base rate.

Question: ${question}

Produce JSON:
{
  "reference_class": "Description of the reference class (e.g., 'major strait blockades since 1945')",
  "base_rate": 0.15,
  "reasoning": "Why this is the right reference class and how the rate was estimated",
  "historical_examples": ["Example 1 with year", "Example 2 with year"]
}
```

**Integration into `researcher.ts`:**
- Before main research call, call `findBaseRate(question)` if `base_rate` is null
- Inject into system prompt:
  ```
  **Reference Class Anchoring:**
  Reference class: ${reference_class}
  Historical base rate: ${base_rate}%
  Use this as your starting anchor, then adjust based on inside-view evidence.
  ```
- Save `base_rate` on the node after research

**UI:** Show base rate alongside current estimate in EvidencePanel stats section.

---

## 4. Resolution + Calibration Tracking

**Problem:** Without resolution, we can't know if the engine is any good. Calibration — the match between predicted and actual frequencies — is the gold standard for forecast quality. A calibration curve is how superforecasters improve.

**Design:**

**Resolution:**
- Extend node status to include `"resolved"`
- New fields: `resolved_at`, `resolved_as` ("yes" | "no" | "partial")
- Brier score computed on resolution: `(probability - outcome)²` where outcome is 1 (yes), 0 (no), or 0.5 (partial)
- Resolution UI in EvidencePanel: Yes/No/Partial buttons for completed nodes
- Nodes past their `resolution_date` get flagged for resolution

**Calibration:**
- Group all resolved nodes by predicted probability into 10 bins (0-10%, 10-20%, ..., 90-100%)
- For each bin: compare average predicted probability vs actual resolution rate
- Perfect calibration: the 70% bin should have ~70% "yes" resolutions
- Overall Brier score: average of all individual Brier scores (lower = better, 0 = perfect)

**New fields on `QuestionNode`:**
- `resolved_at: string | null`
- `resolved_as: "yes" | "no" | "partial" | null`
- `brier_score: number | null`

**New module: `engine/calibration.ts`**
- `resolveQuestion(nodeId, resolution)` — sets fields, computes Brier, records belief history
- `computeCalibrationData()` — builds bins, computes aggregate Brier

**New API: `/api/calibration`**
- `POST { nodeId, resolved_as }` — resolve a question
- `GET` — returns calibration data

**New component: `CalibrationPanel.tsx`**
- SVG calibration curve: x-axis = predicted probability, y-axis = actual rate
- Diagonal reference line (perfect calibration)
- Dots/bars for each bin with count labels
- Aggregate Brier score display
- List of resolved questions with individual Brier scores
- Triggered from a "Calibration" button in the Canvas control bar

---

## 5. Value of Information (VOI) Priority Scorer

**Problem:** Our priority scorer uses heuristic weights (uncertainty, impact, novelty, etc.). Superforecasters ask a sharper question: "which unknown, if resolved, would most reduce my overall uncertainty?" This is value of information — the expected entropy reduction from learning the answer.

**Design:**
- For each open node, simulate resolving it at P=0.1 and P=0.9
- Propagate both scenarios through the graph
- Compute total graph entropy before and after
- VOI = current entropy - expected entropy after learning
- Weight the scenarios by the node's current probability: `E[entropy_after] = P * entropy_if_high + (1-P) * entropy_if_low`
- Rank open nodes by VOI — highest VOI = research this next

**Graph entropy:** Sum of binary entropy per node: `H = Σ[-P·log₂(P) - (1-P)·log₂(1-P)]`

**New module: `engine/analysis/voi.ts`**
- `computeGraphEntropy(nodes)` — pure function
- `computeVOI(nodeId, nodes, edges)` — simulate two resolutions, propagate, measure entropy reduction
- `computeAllVOI(nodes, edges)` — batch for all open nodes, sorted by VOI descending

**Integration into `prioritizer.ts`:**
- Add `voi` to PriorityFactors
- Rebalance weights: VOI gets 0.30 (dominant), reduce others proportionally
- Compute all VOI scores once upfront per scoring round, look up per-node

**Updated weights:**
```
uncertainty: 0.15 (was 0.25)
impact:      0.15 (was 0.25)
voi:         0.30 (new)
novelty:     0.15 (was 0.20)
staleness:   0.08 (was 0.10)
user_interest: 0.12 (was 0.15)
depth_penalty: 0.05 (unchanged)
```

**Performance:** O(N × M) per scoring round where N = open nodes, M = total nodes. Each open node requires 2 propagations. For <200 nodes this runs in milliseconds.

**UI:** Add VOI tab to AnalysisPanel showing ranked list of nodes by VOI score with entropy reduction details.

---

## Implementation Order

```
Phase 1: Foundation
  1. Belief History (Feature 1) — self-contained, provides infrastructure for later features
  2. Operationalization (Feature 2) — feeds resolution criteria to Feature 4

Phase 2: Anchoring
  3. Base Rates (Feature 3) — builds on operationalized questions for better reference classes

Phase 3: Scoring
  4. Resolution + Calibration (Feature 4) — requires operationalization + belief history
  5. VOI Priority Scorer (Feature 5) — benefits from stable graph with all other features
```

**Dependencies:**
- Feature 4 (Resolution) depends on Feature 2 (Operationalization) for resolution criteria
- Feature 4 (Resolution) depends on Feature 1 (Belief History) for recording resolution events
- Feature 5 (VOI) is independent but works best when Features 1-4 are stable
- Features 1, 2, 3 are independent of each other

**Estimated token cost per research cycle after all features:**
- Operationalization: ~500 in / ~300 out (one-time per node)
- Base rate: ~400 in / ~300 out (one-time per node)
- Research: ~2000 in / ~1500 out (existing)
- Critique: ~1500 in / ~800 out (existing)
- Net increase: ~35% more tokens on first research of each node, zero overhead on subsequent cycles

# SPEC v0.6 — Graph Navigation at Scale

## Problem

At 300+ nodes the dagre-laid-out graph becomes a wall of identically-sized cards. Zooming out to see structure makes every label unreadable; zooming in to read a node loses all context. There's no way to filter, collapse, or visually prioritize.

---

## Feature 1 — Semantic Zoom (Level of Detail)

Three rendering tiers based on the current React Flow viewport zoom level:

| Zoom range | Tier | Rendering |
|---|---|---|
| < 0.35 | **Dot** | Colored circle (12–20px). Color = status. Size encodes probability (higher P = larger). No text. Handles hidden. |
| 0.35–0.7 | **Compact** | Pill shape (~180×36px). One line: truncated question (≤40 chars) + probability badge. Status color left border. No summary, no expand. |
| > 0.7 | **Full** | Current card (240–360px wide). Status header, full question, priority, expandable summary. |

**Implementation:**

- `QuestionNode.tsx` reads zoom from React Flow's `useStore(s => s.transform[2])`.
- Single component with conditional rendering per tier — no separate node types.
- Transitions are instant (no animation between tiers — the snap is less disorienting than morphing).
- Annotation nodes: hide below zoom 0.4, show compact text above.
- Edge labels: hide below zoom 0.5.
- Edge stroke width: scale inversely with zoom below 0.5 (so edges don't dominate at low zoom).

**Zoom thresholds** are exported constants so they can be tuned easily.

## Feature 2 — Collapsible Subtrees

Users can collapse any node's descendants into a single summary badge.

**Interaction:**
- Double-click a node (or click a collapse/expand toggle icon on the node card) to toggle its subtree.
- Collapsed state shows a small badge on the node: `+N` (number of hidden descendants).
- Expanding restores all descendants and edges.

**State:**
- `collapsedNodeIds: Set<string>` in Canvas state — the set of node IDs whose subtrees are hidden.
- When building the React Flow node/edge arrays from graph data, walk from each collapsed node and exclude its descendants (unless those descendants are themselves roots of visible branches via other edges).
- Collapsing is transitive: if A is collapsed and A→B→C, both B and C are hidden.
- If the user collapses B first, then collapses A, and then expands A, B should still be collapsed (its children stay hidden).

**Layout impact:**
- Collapsed nodes are treated as leaf nodes by dagre, so the layout naturally compacts.
- Re-layout is triggered on collapse/expand.

**Persistence:**
- Collapsed state is session-only (React state). Not persisted to DB.

## Feature 3 — Filter & Dim

A filter bar below the main control bar. Non-matching nodes render at 20% opacity (not removed — preserves spatial memory and edge continuity).

**Filters (all combinable with AND logic):**

| Filter | Control | Default |
|---|---|---|
| **Status** | Multi-select chips: open, researching, complete, stale, resolved | All selected |
| **Depth** | Range slider: 0 to max depth | Full range |
| **Probability** | Range slider: 0% to 100% | Full range |
| **Search** | Text input, matches against question text (case-insensitive substring) | Empty (matches all) |

**Implementation:**
- `FilterBar.tsx` component renders below the control bar.
- Emits a filter predicate: `(node: QuestionNode) => boolean`.
- Canvas passes predicate to `applyGraph`. Nodes failing the predicate get `style: { opacity: 0.15, pointerEvents: "none" }`. Their edges also dim.
- Matching nodes get a subtle highlight ring when any filter is active (so you can see what matched).
- "Clear filters" button resets everything.
- Filter bar is collapsible (toggle with a funnel icon) to save screen space.

## Feature 4 — Edge Declutter

Edges contribute more visual noise than information at low zoom.

**Rules:**
- Below zoom 0.5: hide all edge labels.
- Below zoom 0.35: reduce edge opacity to 0.3, stroke width to 1px.
- When a node is selected: its direct edges render at full opacity and width. All other edges dim to 0.15 opacity. This creates a "spotlight" effect.
- Animated edges (currently all `causes` relationships): only animate when zoom > 0.5 to reduce rendering cost.

**Implementation:**
- Edge styling is computed in `applyGraph` based on current zoom and selected node.
- A custom edge component isn't needed — React Flow's `style` and `labelStyle` props on edge objects are sufficient.
- Zoom is read via `useStore` in Canvas and passed to `applyGraph`.

---

## Supplement: Future Techniques (not implemented now)

### Feature 5 — Fisheye Distortion

Magnify the region around the cursor while keeping the full graph visible in compressed form around the periphery.

**Approach:**
- Apply a nonlinear coordinate transform to node positions based on distance from cursor.
- Nodes near the cursor expand to full size; distant nodes compress.
- Requires overriding React Flow's node positioning on every mouse move — potentially expensive at 300+ nodes.

**Trade-offs:**
- Pro: See detail and context simultaneously without zoom/pan.
- Con: Disorienting (positions are unstable), high render cost, conflicts with drag interactions.
- Alternative: A "lens" overlay that magnifies a fixed circular region, like a magnifying glass dragged over the graph.

**When to build:** If users report that zoom-based LOD isn't enough — that they need detail + context in a single view without panning.

### Feature 6 — Force-Directed Clustering

Replace dagre's strict hierarchy with a physics simulation that naturally groups related nodes.

**Approach:**
- Use d3-force (or a WebWorker-based force simulation) with:
  - Link forces from edges (shorter links for stronger relationships)
  - Charge repulsion between all nodes
  - Gravity wells per depth level (to preserve rough top-down flow)
  - Collision detection for node bounding boxes
- Optionally: community detection (Louvain or label propagation) to identify clusters, then apply cluster-level forces.

**Trade-offs:**
- Pro: Organic layout that reveals structure invisible in a tree. Cross-branch edges don't create visual chaos.
- Con: Non-deterministic (different every time), slower to compute, loses the clean parent→child readability.
- Hybrid option: Use dagre for initial positions, then apply light force simulation to relax overlaps and route cross-branch edges.

**When to build:** When the graph has significant cross-branch edges (from synthesis/entity linking) that make dagre's tree layout misleading.

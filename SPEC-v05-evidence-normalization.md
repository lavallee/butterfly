# SPEC v0.5 — Evidence Normalization

## Problem

Evidence is stored as a JSON array column (`TEXT`) on the `nodes` table. This means:

1. **No cross-referencing** — if the same data point surfaces in two research branches, it's stored twice with no link between them
2. **No deduplication** — identical or near-identical evidence accumulates silently
3. **No evidence-centric queries** — can't ask "which nodes cite this source?" or "what's the most-cited evidence?"
4. **No independent lifecycle** — evidence can't be annotated, rated, or invalidated without touching the parent node
5. **Wasted context** — briefings and audits ignore evidence items entirely because there's no structured way to reason over them

## Design

### 1. New `evidence` Table

```sql
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT,            -- named source, URL, publication
  found_at TEXT NOT NULL, -- ISO timestamp of first discovery
  content_hash TEXT NOT NULL, -- SHA-256 of normalized content for dedup
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_evidence_hash ON evidence(content_hash);
```

`content_hash` is computed from lowercased, whitespace-normalized `content`. This enables fast dedup lookups without fuzzy matching (fuzzy/semantic matching can come later).

### 2. Junction Table `node_evidence`

```sql
CREATE TABLE node_evidence (
  node_id TEXT NOT NULL REFERENCES nodes(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  context TEXT,           -- how this evidence relates to this specific node
  added_at TEXT NOT NULL, -- when this citation was added
  PRIMARY KEY (node_id, evidence_id)
);

CREATE INDEX idx_node_evidence_evidence ON node_evidence(evidence_id);
```

The `context` column is optional free text explaining why this evidence is relevant to this particular node (since the same evidence may support different conclusions in different contexts).

### 3. Migration Strategy

- Keep the JSON `evidence` column on `nodes` temporarily for backward compat during migration
- On startup, migrate existing JSON evidence into the new tables:
  - For each node, extract evidence items
  - Hash each item's content
  - INSERT OR IGNORE into `evidence` (dedup by hash)
  - INSERT into `node_evidence` junction
- After migration, the JSON column becomes a denormalized cache (or is dropped)
- All new writes go through the normalized path

### 4. DB Layer Changes (`src/lib/db.ts`)

New functions:

```
insertEvidence(content, source) → Evidence
  - Computes content_hash
  - INSERT OR IGNORE (returns existing if duplicate)
  - Returns the evidence record (new or existing)

linkEvidenceToNode(nodeId, evidenceId, context?) → void
  - INSERT OR IGNORE into node_evidence

getEvidenceForNode(nodeId) → Evidence[]
  - JOIN evidence + node_evidence WHERE node_id = ?

getNodesForEvidence(evidenceId) → {nodeId, question}[]
  - JOIN node_evidence + nodes WHERE evidence_id = ?
  - "Which nodes cite this evidence?"

getEvidenceStats() → {total, unique_sources, most_cited[]}
  - Aggregate queries for dashboard use
```

`rowToNode()` changes:
- Instead of `JSON.parse(row.evidence)`, call `getEvidenceForNode(row.id)`
- Or: keep the JSON column as a read cache, populated on write

### 5. Researcher Integration (`src/engine/researcher.ts`, `src/engine/graph.ts`)

In `applyResearchResult()`:
- For each evidence item in the research result:
  1. Call `insertEvidence(content, source)` — dedup happens here
  2. Call `linkEvidenceToNode(nodeId, evidenceId)`
- Remove the `evidence: [...node.evidence, ...result.evidence]` spread pattern
- The node's evidence is now always derived from the junction table

### 6. Deduplication

**Exact match**: content_hash catches identical evidence text across nodes.

**Near-duplicate detection** (lightweight, no ML):
- When inserting new evidence, also check for existing evidence with high token overlap (Jaccard on word sets, reusing the existing `jaccardSimilarity` from `src/engine/graph.ts`)
- Threshold: 0.8 similarity → link to existing evidence instead of creating new
- Log when a near-duplicate is detected so the user can review

### 7. Cross-Reference UI (`src/components/EvidencePanel.tsx`)

When displaying an evidence item:
- Show a small badge if it's cited by multiple nodes: `"Cited by 3 nodes"`
- Clicking the badge shows the other nodes that cite this evidence
- Click a node name to navigate to it (via existing `onNodeFocus`)

### 8. Evidence API Endpoint

New route: `GET /api/evidence`

- `?node_id=X` — evidence for a specific node
- `?evidence_id=X` — nodes that cite this evidence
- `?stats=true` — aggregate stats (total evidence, most-cited, source distribution)
- No write endpoint needed — evidence is created through the research loop

### 9. Impact on Existing Features

| Feature | Change |
|---------|--------|
| Researcher | No change to LLM prompt; parsing stays the same |
| Graph.applyResearchResult | Writes to evidence + node_evidence tables instead of JSON append |
| EvidencePanel | Reads from new tables; adds cross-ref badge |
| Critic | Can now receive "this evidence also supports nodes X, Y" in prompt |
| Briefing | Can reference shared evidence across themes |
| Audit | Can flag contradictory nodes that share the same evidence |
| Seed scenario | Initialize with empty evidence (no change) |

### 10. Non-Goals (for now)

- Semantic/embedding-based dedup (would need a vector store)
- Evidence quality scoring or reliability ratings
- External source verification / link checking
- Full-text search across evidence (could add later with FTS5)
- User-submitted evidence (currently all evidence comes from the researcher)

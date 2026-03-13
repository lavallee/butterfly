# Butterfly v0.2 — Feature Spec

Informed by analysis of BabyAGI, AutoGPT, SuperAGI, AutoGen, and AgentGPT.

## 1. Loop / Duplicate Detection

**Problem:** Every autonomous agent system struggles with generating near-duplicate questions or re-researching the same territory. AutoGPT's most notorious failure mode is infinite loops.

**Design:**
- Before creating a new question node, compute similarity against all existing questions
- Use normalized Levenshtein distance + keyword overlap as a fast heuristic (no vector DB needed)
- Threshold: if similarity > 0.7, skip the question and log it as a duplicate
- Track "duplicate attempts" per parent node — if a parent keeps generating duplicates, it signals the branch is exhausted
- Surface duplicate detections in the activity log

**Implementation:** Add `detectDuplicate()` to `engine/graph.ts`. Check in `applyResearchResult()` before creating child nodes.

---

## 2. Token Budget Tracking + Cost Display

**Problem:** $10 of API credits goes fast with continuous research. SuperAGI's monitoring dashboard tracks per-model token breakdowns. Users need visibility into spend.

**Design:**
- Track input/output tokens per research cycle from the API response `usage` field
- Store cumulative totals in `engine_state` table
- Calculate estimated cost using Sonnet pricing ($3/M input, $15/M output)
- Display in the stats bar: cost this session, tokens used, avg cost per cycle
- Support a configurable budget cap — engine stops when budget is exhausted

**Implementation:** Update `researcher.ts` to return token usage. Add `budget.ts` for tracking. Add budget display to Canvas stats bar. Add budget cap check in `loop.ts`.

---

## 3. Self-Criticism Step

**Problem:** AutoGPT's ReACT framework forces self-criticism on every cycle. Without it, research results go unchallenged and weak claims propagate through the graph.

**Design:**
- After the researcher produces results, run a second LLM call: the "critic"
- Critic prompt: given the question, the research summary, and the evidence, identify: (a) weakest claims, (b) missing perspectives, (c) potential biases, (d) confidence adjustment
- Critic can adjust probability and confidence estimates
- Critic output is appended to the node as a `critique` field
- This is cheaper than a full second research call — short prompt, short response

**Implementation:** Add `critic.ts` to `engine/`. Call it in `loop.ts` after `research()` but before `applyResearchResult()`. Add `critique` field to `QuestionNode` type.

---

## 4. Activity Log

**Problem:** Every agent system that lacks an activity log gets criticized for opacity. Users need to see what the engine did, in what order, and why.

**Design:**
- Persistent log of engine actions stored in a `activity_log` table
- Event types: `research_started`, `research_completed`, `question_created`, `question_skipped_duplicate`, `probability_propagated`, `critique_applied`, `budget_warning`, `engine_started`, `engine_stopped`
- Each event: `{ id, type, timestamp, node_id?, detail }`
- Render as a collapsible sidebar on the left side of the canvas
- Auto-scroll to latest, with ability to scroll back
- Clicking a log entry highlights the related node on the canvas

**Implementation:** Add `activity_log` table to `db.ts`. Add `log()` helper. Sprinkle log calls through the engine. New `ActivityLog` component. New `/api/activity` endpoint.

---

## 5. Cross-Question Memory (Key Findings Summary)

**Problem:** Each research cycle only sees its ancestor chain and siblings. It has no awareness of findings from other branches. AutoGPT's vector search approach causes circular retrieval. BabyBeeAGI's global JSON state is the right intuition.

**Design:**
- Maintain a running "key findings" document — a structured summary of the most important discoveries across the entire graph
- After each research cycle, extract 1-3 key findings and append them to the summary
- The summary is included in every research prompt as global context
- Cap the summary at ~2000 tokens; when it overflows, use an LLM call to compress it
- Store in `engine_state` as `key_findings`

**Implementation:** Add `memory.ts` to `engine/`. Called after each cycle in `loop.ts`. Findings injected into the researcher prompt.

---

## 6. Researcher + Critic Dual Agents

**Problem:** AutoGen's core insight — one agent researches, another challenges. Single-perspective research misses blind spots.

**Design:**
- This builds on #3 (Self-Criticism) but makes it more robust
- The critic doesn't just check the research — it can generate counter-questions
- Counter-questions are added as "prevents" or "weakens" edges, modeling opposing forces
- Example: if researcher says "oil prices will spike to $150", critic might add "What diplomatic pressure could prevent sustained price increases?"
- Critic has a different system prompt emphasizing skepticism and lateral thinking

**Implementation:** Extend `critic.ts` to optionally generate counter-questions. These are added to the graph with "prevents" or "weakens" relationship types.

---

## 7. Parallel Research

**Problem:** Our engine is serial — one question at a time. Independent branches could be researched concurrently.

**Design:**
- Identify independent branches: questions whose ancestor chains don't overlap
- Research up to N questions concurrently (default N=3)
- Use `Promise.all()` for concurrent API calls
- Ensure DB writes don't conflict (each node is independent)
- Propagation still runs after all concurrent researches complete

**Implementation:** Modify `loop.ts` to select top-N independent questions and research them in parallel. Add independence check to `prioritizer.ts`.

---

## 8. Approval Gates

**Problem:** AutoGen's TERMINATE mode — pause at configurable thresholds. Users need control over when the engine asks for permission.

**Design:**
- Configurable gates: pause when depth > N, confidence < X, cost > $Y, or question contains certain keywords
- When a gate triggers, the question is marked as `pending_approval` instead of being researched
- The canvas shows pending questions with a distinct visual style (orange border, approval button)
- User can approve (research proceeds), reject (question is removed), or edit (modify the question text)

**Implementation:** Add `gates.ts` to `engine/`. Check gates in `loop.ts` before researching. Add `pending_approval` status to node types. Update `QuestionNode.tsx` for approval UI.

---

## Implementation Order

1. **Token budget tracking** — small, high-value, needed immediately
2. **Activity log** — infrastructure that makes everything else debuggable
3. **Loop/duplicate detection** — prevents waste
4. **Self-criticism step** — improves quality
5. **Cross-question memory** — improves coherence
6. **Researcher + Critic dual agents** — extends #4
7. **Parallel research** — performance
8. **Approval gates** — control

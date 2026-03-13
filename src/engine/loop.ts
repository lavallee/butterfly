import {
  getAllNodes,
  getAllEdges,
  getAllAnnotations,
  upsertNode,
  getEngineState,
  setEngineState,
  logActivity,
  recordBeliefUpdate,
} from "@/lib/db";
import { scoreAllNodes } from "./prioritizer";
import { research } from "./researcher";
import { critique } from "./critic";
import { trackTokens, checkBudget } from "./budget";
import { getKeyFindings, updateKeyFindings } from "./memory";
import {
  applyResearchResult,
  getAncestorQuestions,
  getSiblingQuestions,
} from "./graph";
import { propagate } from "./propagator";
import { operationalize } from "./operationalizer";
import { findBaseRate } from "./baserate";
import type { QuestionNode } from "@/types";

const CYCLE_DELAY_MS = 5000;
const MAX_CYCLES = 100;

/**
 * Run one cycle of the research loop:
 * 1. Check budget
 * 2. Score all open questions
 * 3. Pick the highest-priority one
 * 4. Research it
 * 5. Critique the research
 * 6. Apply results (update node, create follow-ups)
 * 7. Update key findings memory
 * 8. Propagate probability changes
 */
export async function runOneCycle(): Promise<{
  researched: QuestionNode | null;
  newQuestions: number;
  duplicatesSkipped: number;
}> {
  // Budget check
  const budget = checkBudget();
  if (!budget.ok) {
    return { researched: null, newQuestions: 0, duplicatesSkipped: 0 };
  }

  const nodes = getAllNodes();
  const edges = getAllEdges();
  const annotations = getAllAnnotations();

  // Score and pick
  const scored = scoreAllNodes(nodes, edges, annotations);
  scored.forEach((n) => upsertNode(n));

  const target = scored[0] || null;
  if (!target) {
    return { researched: null, newQuestions: 0, duplicatesSkipped: 0 };
  }

  console.log(
    `\n🔬 Researching: "${target.question}" (score: ${target.priority_score.toFixed(3)}, depth: ${target.depth})`
  );

  // Mark as researching
  target.status = "researching";
  upsertNode(target);
  setEngineState("current_question_id", target.id);
  logActivity("research_started", `"${target.question.slice(0, 100)}"`, target.id);

  try {
    // Operationalize if not already done
    if (!target.operationalized_question) {
      const opResult = await operationalize(target.question);
      target.operationalized_question = opResult.operationalized_question;
      target.resolution_criteria = opResult.resolution_criteria;
      target.resolution_date = opResult.resolution_date;
      upsertNode(target);
      logActivity("research_started", `Operationalized: "${opResult.operationalized_question.slice(0, 100)}"`, target.id);
    }

    // Find base rate if not already done
    if (target.base_rate === null) {
      const brResult = await findBaseRate(target.operationalized_question || target.question);
      target.base_rate = brResult.base_rate;
      upsertNode(target);
      logActivity("research_started", `Base rate: ${(brResult.base_rate * 100).toFixed(0)}% (${brResult.reference_class.slice(0, 80)})`, target.id);
    }

    // Research with key findings context
    const context = {
      ancestors: getAncestorQuestions(target.id),
      siblings: getSiblingQuestions(target.id),
      keyFindings: getKeyFindings(),
      baseRate: target.base_rate,
    };
    const result = await research(target, context);

    // Track research tokens
    if (result.token_usage) {
      trackTokens(result.token_usage.input, result.token_usage.output);
    }

    // Critique the research
    const critiqueResult = await critique(target, result);
    if (critiqueResult.token_usage) {
      trackTokens(critiqueResult.token_usage.input, critiqueResult.token_usage.output);
    }

    // Apply critique adjustments
    if (critiqueResult.adjusted_probability !== null) {
      result.probability_estimate = critiqueResult.adjusted_probability;
    }
    if (critiqueResult.adjusted_confidence !== null) {
      result.confidence = critiqueResult.adjusted_confidence;
    }

    // Add counter-questions from critic as follow-ups
    for (const cq of critiqueResult.counter_questions) {
      result.follow_up_questions.push({
        question: cq.question,
        relationship: cq.relationship,
        estimated_probability: cq.estimated_probability,
        reasoning: cq.reasoning,
      });
    }

    // Apply results
    const nodesBefore = getAllNodes().length;
    const { updatedNode, newNodes, newEdges } = applyResearchResult(
      target.id,
      result
    );

    // Store critique on the node
    updatedNode.critique = critiqueResult.critique;
    upsertNode(updatedNode);

    // Record belief updates
    recordBeliefUpdate(
      target.id,
      updatedNode.probability,
      updatedNode.confidence,
      "research",
      `Research complete: P=${updatedNode.probability.toFixed(2)} C=${updatedNode.confidence.toFixed(2)}`
    );
    if (critiqueResult.adjusted_probability !== null || critiqueResult.adjusted_confidence !== null) {
      recordBeliefUpdate(
        target.id,
        updatedNode.probability,
        updatedNode.confidence,
        "critic",
        `Critic adjusted: ${critiqueResult.critique?.slice(0, 100) || "no detail"}`
      );
    }

    const duplicatesSkipped = result.follow_up_questions.length - newNodes.length;

    logActivity(
      "research_completed",
      `P=${updatedNode.probability.toFixed(2)} C=${updatedNode.confidence.toFixed(2)} | ${newNodes.length} new questions, ${duplicatesSkipped} duplicates skipped`,
      target.id
    );

    if (critiqueResult.critique) {
      logActivity("critique_applied", critiqueResult.critique.slice(0, 200), target.id);
    }

    console.log(
      `   ✓ P=${updatedNode.probability.toFixed(2)} C=${updatedNode.confidence.toFixed(2)} | ${newNodes.length} follow-ups (${duplicatesSkipped} dupes skipped)`
    );
    for (const n of newNodes) {
      console.log(`   → "${n.question}"`);
    }
    if (critiqueResult.critique) {
      console.log(`   💬 Critic: ${critiqueResult.critique.slice(0, 120)}`);
    }

    // Update key findings memory
    const memoryUsage = await updateKeyFindings(target, result);
    if (memoryUsage.token_usage.input > 0) {
      trackTokens(memoryUsage.token_usage.input, memoryUsage.token_usage.output);
    }

    // Propagate probability changes
    const allNodes = getAllNodes();
    const allEdges = getAllEdges();
    const propagated = propagate(target.id, allNodes, allEdges);
    const changed = propagated.filter((n) => {
      const orig = allNodes.find((o) => o.id === n.id);
      return orig && Math.abs(orig.probability - n.probability) > 0.01;
    });
    propagated.forEach((n) => upsertNode(n));

    // Record belief updates for propagated nodes
    for (const n of changed) {
      recordBeliefUpdate(
        n.id,
        n.probability,
        n.confidence,
        "propagation",
        `Propagated from "${target.question.slice(0, 60)}"`
      );
    }

    if (changed.length > 0) {
      logActivity(
        "probability_propagated",
        `${changed.length} nodes updated after probability change`,
        target.id
      );
    }

    // Update engine state
    const cycles = parseInt(getEngineState("cycles_completed") || "0") + 1;
    setEngineState("cycles_completed", cycles.toString());
    setEngineState("last_cycle_at", new Date().toISOString());
    setEngineState("current_question_id", "");

    return { researched: updatedNode, newQuestions: newNodes.length, duplicatesSkipped };
  } catch (err: any) {
    console.error(`   ✗ Research failed:`, err?.message || err);
    target.status = "open";
    upsertNode(target);
    setEngineState("current_question_id", "");
    throw err;
  }
}

/**
 * Run the loop continuously until stopped or max cycles reached.
 */
export async function runLoop(maxCycles = MAX_CYCLES): Promise<void> {
  setEngineState("running", "true");
  logActivity("engine_started", `Starting engine (max ${maxCycles} cycles)`);

  for (let i = 0; i < maxCycles; i++) {
    const running = getEngineState("running");
    if (running !== "true") {
      logActivity("engine_stopped", "Engine stopped by user");
      break;
    }

    const result = await runOneCycle();

    if (!result.researched) {
      logActivity("engine_stopped", "No open questions to research");
      break;
    }

    await new Promise((r) => setTimeout(r, CYCLE_DELAY_MS));
  }

  setEngineState("running", "false");
}

import {
  getAllNodes,
  getAllEdges,
  getAllAnnotations,
  upsertNode,
  getEngineState,
  setEngineState,
} from "@/lib/db";
import { pickNext, scoreAllNodes } from "./prioritizer";
import { research } from "./researcher";
import {
  applyResearchResult,
  getAncestorQuestions,
  getSiblingQuestions,
} from "./graph";
import { propagate } from "./propagator";
import type { QuestionNode } from "@/types";

const CYCLE_DELAY_MS = 5000; // 5 seconds between research cycles
const MAX_CYCLES = 100; // Safety limit per run

/**
 * Run one cycle of the research loop:
 * 1. Score all open questions
 * 2. Pick the highest-priority one
 * 3. Research it
 * 4. Apply results (update node, create follow-ups)
 * 5. Propagate probability changes
 * 6. Re-score everything
 */
export async function runOneCycle(): Promise<{
  researched: QuestionNode | null;
  newQuestions: number;
}> {
  const nodes = getAllNodes();
  const edges = getAllEdges();
  const annotations = getAllAnnotations();

  // Score and pick
  const scored = scoreAllNodes(nodes, edges, annotations);
  scored.forEach((n) => upsertNode(n)); // persist scores

  const target = scored[0] || null;
  if (!target) {
    return { researched: null, newQuestions: 0 };
  }

  console.log(
    `\n🔬 Researching: "${target.question}" (score: ${target.priority_score.toFixed(3)}, depth: ${target.depth})`
  );

  // Mark as researching
  target.status = "researching";
  upsertNode(target);
  setEngineState("current_question_id", target.id);

  try {
    // Research
    const context = {
      ancestors: getAncestorQuestions(target.id),
      siblings: getSiblingQuestions(target.id),
    };
    const result = await research(target, context);

    // Apply results
    const { updatedNode, newNodes, newEdges } = applyResearchResult(
      target.id,
      result
    );

    console.log(
      `   ✓ P=${updatedNode.probability.toFixed(2)} C=${updatedNode.confidence.toFixed(2)} | ${newNodes.length} follow-up questions generated`
    );
    for (const n of newNodes) {
      console.log(`   → "${n.question}"`);
    }

    // Propagate probability changes
    const allNodes = getAllNodes();
    const allEdges = getAllEdges();
    const propagated = propagate(target.id, allNodes, allEdges);
    propagated.forEach((n) => upsertNode(n));

    // Update engine state
    const cycles = parseInt(getEngineState("cycles_completed") || "0") + 1;
    setEngineState("cycles_completed", cycles.toString());
    setEngineState("last_cycle_at", new Date().toISOString());
    setEngineState("current_question_id", "");

    return { researched: updatedNode, newQuestions: newNodes.length };
  } catch (err: any) {
    console.error(`   ✗ Research failed:`, err?.message || err);
    // Revert status
    target.status = "open";
    upsertNode(target);
    setEngineState("current_question_id", "");
    // Re-throw so the API layer can report the error
    throw err;
  }
}

/**
 * Run the loop continuously until stopped or max cycles reached.
 */
export async function runLoop(maxCycles = MAX_CYCLES): Promise<void> {
  setEngineState("running", "true");
  console.log(`🦋 Butterfly engine starting (max ${maxCycles} cycles)...\n`);

  for (let i = 0; i < maxCycles; i++) {
    const running = getEngineState("running");
    if (running !== "true") {
      console.log("\n⏹ Engine stopped.");
      break;
    }

    const result = await runOneCycle();

    if (!result.researched) {
      console.log("\nNo open questions to research. Engine idle.");
      break;
    }

    // Brief pause between cycles
    await new Promise((r) => setTimeout(r, CYCLE_DELAY_MS));
  }

  setEngineState("running", "false");
  console.log("\n🦋 Engine finished.");
}

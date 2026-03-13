import type { SynthesisResult } from "@/types";
import { getAllNodes, getAllEdges, setSynthesisResult, logActivity } from "@/lib/db";
import {
  extractAllEntities,
  buildEntityClusters,
  proposeEntityEdges,
} from "./entities";
import { auditGraph } from "./audit";
import { generateBriefing } from "./briefing";

/**
 * Run the full synthesis pipeline:
 * 1. Entity extraction (per-node)
 * 2. Entity clustering + edge proposals
 * 3. Consistency audit (whole graph)
 * 4. Briefing generation
 */
export async function runSynthesis(): Promise<SynthesisResult> {
  const partial: SynthesisResult = {
    status: "running",
    entities_extracted: 0,
    proposed_edges: [],
    audit: null,
    briefing: null,
  };

  setSynthesisResult(partial);
  logActivity("engine_started", "Synthesis pipeline started");

  try {
    // Step 1: Entity extraction
    const extraction = await extractAllEntities();
    partial.entities_extracted = extraction.extracted;
    setSynthesisResult(partial);

    // Step 2: Entity clustering and edge proposals
    const nodes = getAllNodes();
    const edges = getAllEdges();
    const clusters = buildEntityClusters(
      nodes.filter((n) => n.status === "complete")
    );
    const proposedEdges = proposeEntityEdges(nodes, edges);
    partial.proposed_edges = proposedEdges;
    setSynthesisResult(partial);

    if (proposedEdges.length > 0) {
      logActivity(
        "research_completed",
        `Entity analysis proposed ${proposedEdges.length} new cross-branch connections`
      );
    }

    // Step 3: Consistency audit
    const audit = await auditGraph();
    partial.audit = audit;
    setSynthesisResult(partial);

    // Step 4: Briefing generation
    const briefing = await generateBriefing(clusters, audit);
    partial.briefing = briefing;
    partial.status = "complete";
    setSynthesisResult(partial);

    logActivity("engine_stopped", "Synthesis pipeline complete");

    return partial;
  } catch (err: any) {
    partial.status = "error";
    partial.error = err?.message || "Unknown synthesis error";
    setSynthesisResult(partial);
    logActivity("engine_stopped", `Synthesis failed: ${partial.error}`);
    return partial;
  }
}

import { NextResponse } from "next/server";
import { runSynthesis } from "@/engine/synthesis";
import {
  getSynthesisResult,
  setSynthesisResult,
  insertEdge,
  upsertNode,
  getNode,
  logActivity,
} from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (action === "apply_edges") {
    const result = getSynthesisResult();
    if (!result?.proposed_edges?.length) {
      return NextResponse.json({ error: "No proposed edges" }, { status: 400 });
    }

    // Check existing edges to prevent duplicates
    const { getAllEdges } = await import("@/lib/db");
    const existing = getAllEdges();
    const existingPairs = new Set(
      existing.map((e: any) => `${e.source_id}:${e.target_id}`)
    );

    let applied = 0;
    for (const edge of result.proposed_edges) {
      const key = `${edge.source_id}:${edge.target_id}`;
      const reverseKey = `${edge.target_id}:${edge.source_id}`;
      if (existingPairs.has(key) || existingPairs.has(reverseKey)) continue;

      insertEdge({
        id: uuid(),
        source_id: edge.source_id,
        target_id: edge.target_id,
        relationship: edge.relationship,
        strength: 0.4,
      });
      existingPairs.add(key);
      applied++;
    }

    // Clear proposed edges from stored result to prevent re-apply
    result.proposed_edges = [];
    setSynthesisResult(result);

    logActivity(
      "research_completed",
      `Applied ${applied} cross-branch edges from entity analysis`
    );

    return NextResponse.json({ applied });
  }

  if (action === "apply_adjustments") {
    const result = getSynthesisResult();
    if (!result?.audit?.findings) {
      return NextResponse.json({ error: "No audit findings" }, { status: 400 });
    }

    let adjusted = 0;
    for (const finding of result.audit.findings) {
      if (
        finding.suggestion.type === "adjust_probability" &&
        finding.suggestion.node_id &&
        finding.suggestion.suggested_probability != null
      ) {
        const node = getNode(finding.suggestion.node_id);
        if (node) {
          node.probability = finding.suggestion.suggested_probability;
          node.updated_at = new Date().toISOString();
          upsertNode(node);
          adjusted++;
        }
      }
    }

    // Mark adjustments as applied in stored result
    result.audit.findings = result.audit.findings.map((f: any) =>
      f.suggestion.type === "adjust_probability" ? { ...f, _applied: true } : f
    );
    setSynthesisResult(result);

    logActivity(
      "probability_propagated",
      `Applied ${adjusted} probability adjustments from audit`
    );

    return NextResponse.json({ adjusted });
  }

  // Default: run full synthesis pipeline
  try {
    const result = await runSynthesis();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const result = getSynthesisResult();
  return NextResponse.json(result || { status: "idle" });
}

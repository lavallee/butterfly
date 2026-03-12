import { NextResponse } from "next/server";
import { runOneCycle } from "@/engine/loop";
import {
  getEngineState,
  setEngineState,
} from "@/lib/db";
import { createHormuzSeed } from "../../../../seeds/hormuz-blockade";

// POST /api/research - trigger one research cycle
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (action === "seed") {
    // Seed the graph with the Hormuz scenario
    const { nodes, edges } = createHormuzSeed();
    const { upsertNode, insertEdge } = await import("@/lib/db");
    for (const node of nodes) upsertNode(node);
    for (const edge of edges) insertEdge(edge);
    return NextResponse.json({
      seeded: true,
      nodes: nodes.length,
      edges: edges.length,
    });
  }

  if (action === "stop") {
    setEngineState("running", "false");
    return NextResponse.json({ stopped: true });
  }

  // Run one cycle
  try {
    const result = await runOneCycle();
    return NextResponse.json({
      researched: result.researched?.question || null,
      newQuestions: result.newQuestions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/research - engine status
export async function GET() {
  return NextResponse.json({
    running: getEngineState("running") === "true",
    current_question_id: getEngineState("current_question_id") || null,
    cycles_completed: parseInt(getEngineState("cycles_completed") || "0"),
    last_cycle_at: getEngineState("last_cycle_at") || null,
  });
}

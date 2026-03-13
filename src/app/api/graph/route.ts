import { NextResponse } from "next/server";
import { getFullGraph, upsertNode, getAllNodes, getBeliefHistory, recordBeliefUpdate } from "@/lib/db";
import type { QuestionNode } from "@/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const beliefHistoryFor = searchParams.get("belief_history");

  if (beliefHistoryFor) {
    const history = getBeliefHistory(beliefHistoryFor);
    return NextResponse.json(history);
  }

  const graph = getFullGraph();
  return NextResponse.json(graph);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { nodeId, updates } = body as {
    nodeId: string;
    updates: Partial<QuestionNode>;
  };

  const nodes = getAllNodes();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const updated = {
    ...node,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  upsertNode(updated);

  // Record belief update if probability or confidence changed by user
  const probChanged = updates.probability !== undefined && Math.abs(updates.probability - node.probability) > 0.001;
  const confChanged = updates.confidence !== undefined && Math.abs(updates.confidence - node.confidence) > 0.001;
  if (probChanged || confChanged) {
    recordBeliefUpdate(
      nodeId,
      updated.probability,
      updated.confidence,
      "user",
      `Manual adjustment: P=${updated.probability.toFixed(2)} C=${updated.confidence.toFixed(2)}`
    );
  }

  return NextResponse.json(updated);
}

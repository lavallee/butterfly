import { NextResponse } from "next/server";
import { getFullGraph, upsertNode, getAllNodes, getAllEdges } from "@/lib/db";
import { scoreAllNodes } from "@/engine/prioritizer";
import { getAllAnnotations } from "@/lib/db";
import type { QuestionNode } from "@/types";

export async function GET() {
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

  return NextResponse.json(updated);
}

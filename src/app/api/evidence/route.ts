import { NextResponse } from "next/server";
import {
  getEvidenceForNode,
  getNodesForEvidence,
  getEvidenceStats,
} from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("node_id");
  const evidenceId = searchParams.get("evidence_id");
  const stats = searchParams.get("stats");

  if (nodeId) {
    return NextResponse.json(getEvidenceForNode(nodeId));
  }

  if (evidenceId) {
    return NextResponse.json(getNodesForEvidence(evidenceId));
  }

  if (stats) {
    return NextResponse.json(getEvidenceStats());
  }

  // Default: return stats
  return NextResponse.json(getEvidenceStats());
}

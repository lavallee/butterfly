import { NextResponse } from "next/server";
import { resolveQuestion, computeCalibrationData } from "@/engine/calibration";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { nodeId, resolved_as } = body as {
    nodeId?: string;
    resolved_as?: "yes" | "no" | "partial";
  };

  if (!nodeId || !resolved_as) {
    return NextResponse.json(
      { error: "nodeId and resolved_as required" },
      { status: 400 }
    );
  }

  try {
    const node = resolveQuestion(nodeId, resolved_as);
    return NextResponse.json(node);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const data = computeCalibrationData();
  return NextResponse.json(data);
}

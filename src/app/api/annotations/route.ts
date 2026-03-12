import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { insertAnnotation, getAllAnnotations } from "@/lib/db";
import type { Annotation } from "@/types";

export async function GET() {
  return NextResponse.json(getAllAnnotations());
}

export async function POST(req: Request) {
  const body = await req.json();
  const annotation: Annotation = {
    id: uuid(),
    node_id: body.node_id || null,
    content: body.content,
    type: body.type || "insight",
    position: body.position || { x: 0, y: 0 },
    created_at: new Date().toISOString(),
  };
  insertAnnotation(annotation);
  return NextResponse.json(annotation);
}

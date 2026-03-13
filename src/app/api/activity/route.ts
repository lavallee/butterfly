import { NextResponse } from "next/server";
import { getActivityLog } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const events = getActivityLog(limit);
  return NextResponse.json(events);
}

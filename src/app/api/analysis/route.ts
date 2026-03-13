import { NextResponse } from "next/server";
import { getEngineState, setEngineState } from "@/lib/db";
import { runSensitivityAnalysis } from "@/engine/analysis/sensitivity";
import { runConvergenceAnalysis } from "@/engine/analysis/convergence";
import { runWhatIfAnalysis } from "@/engine/analysis/whatif";
import { runTimelineAnalysis } from "@/engine/analysis/timeline";
import { runMonteCarloSimulation } from "@/engine/analysis/montecarlo";

function getStored(key: string): any | null {
  const json = getEngineState(`analysis_${key}`);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function store(key: string, result: any): void {
  setEngineState(`analysis_${key}`, JSON.stringify(result));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { type, scenario } = body as { type: string; scenario?: any };

  try {
    switch (type) {
      case "sensitivity": {
        const result = runSensitivityAnalysis();
        store("sensitivity", result);
        return NextResponse.json(result);
      }
      case "convergence": {
        const result = runConvergenceAnalysis();
        store("convergence", result);
        return NextResponse.json(result);
      }
      case "whatif": {
        if (!scenario) {
          return NextResponse.json(
            { error: "scenario required for what-if analysis" },
            { status: 400 }
          );
        }
        const result = runWhatIfAnalysis(scenario);
        store("whatif", result);
        return NextResponse.json(result);
      }
      case "timeline": {
        const result = await runTimelineAnalysis();
        store("timeline", result);
        return NextResponse.json(result);
      }
      case "montecarlo": {
        const simulations = body.simulations || 10000;
        const result = runMonteCarloSimulation(simulations);
        store("montecarlo", result);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: `Unknown analysis type: ${type}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  if (type) {
    return NextResponse.json(getStored(type) || { status: "not_run" });
  }

  // Return all available results
  const types = ["sensitivity", "convergence", "whatif", "timeline", "montecarlo"];
  const results: Record<string, any> = {};
  for (const t of types) {
    const stored = getStored(t);
    results[t] = stored ? { available: true, timestamp: stored.timestamp } : { available: false };
  }
  return NextResponse.json(results);
}

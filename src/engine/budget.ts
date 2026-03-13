import { getEngineState, setEngineState, logActivity } from "@/lib/db";
import type { BudgetState } from "@/types";

// Sonnet pricing as of 2025
const COST_PER_M_INPUT = 3.0;
const COST_PER_M_OUTPUT = 15.0;

export function trackTokens(input: number, output: number): void {
  const totalInput =
    parseInt(getEngineState("total_input_tokens") || "0") + input;
  const totalOutput =
    parseInt(getEngineState("total_output_tokens") || "0") + output;

  setEngineState("total_input_tokens", totalInput.toString());
  setEngineState("total_output_tokens", totalOutput.toString());

  const cost = estimateCost(totalInput, totalOutput);
  setEngineState("estimated_cost_usd", cost.toFixed(6));
}

export function getBudgetState(): BudgetState {
  const totalInput = parseInt(getEngineState("total_input_tokens") || "0");
  const totalOutput = parseInt(getEngineState("total_output_tokens") || "0");
  const capStr = getEngineState("budget_cap_usd");

  return {
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    estimated_cost_usd: estimateCost(totalInput, totalOutput),
    budget_cap_usd: capStr ? parseFloat(capStr) : null,
  };
}

export function setBudgetCap(usd: number): void {
  setEngineState("budget_cap_usd", usd.toString());
}

export function checkBudget(): { ok: boolean; remaining: number | null } {
  const state = getBudgetState();
  if (state.budget_cap_usd === null) return { ok: true, remaining: null };

  const remaining = state.budget_cap_usd - state.estimated_cost_usd;

  if (remaining <= 0) {
    logActivity("budget_exhausted", `Budget cap of $${state.budget_cap_usd.toFixed(2)} reached. Spent: $${state.estimated_cost_usd.toFixed(4)}`);
    return { ok: false, remaining: 0 };
  }

  if (remaining < state.budget_cap_usd * 0.1) {
    logActivity("budget_warning", `Less than 10% budget remaining: $${remaining.toFixed(4)} left`);
  }

  return { ok: true, remaining };
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_M_INPUT +
    (outputTokens / 1_000_000) * COST_PER_M_OUTPUT
  );
}

// ---- Core Graph Types ----

export interface QuestionNode {
  id: string;
  question: string;
  status: "open" | "researching" | "complete" | "stale" | "resolved";
  probability: number; // 0-1, likelihood this outcome/event occurs
  confidence: number; // 0-1, how confident we are in our probability estimate
  summary: string | null; // Research findings
  critique: string | null; // Critic's assessment
  evidence: Evidence[];
  entities: Entity[];
  depth: number; // Distance from root
  priority_score: number; // Computed by prioritizer
  position: { x: number; y: number }; // Canvas position
  operationalized_question: string | null;
  resolution_criteria: string | null;
  resolution_date: string | null;
  resolved_at: string | null;
  resolved_as: "yes" | "no" | "partial" | null;
  brier_score: number | null;
  base_rate: number | null;
  created_at: string;
  updated_at: string;
  researched_at: string | null;
}

export interface Evidence {
  id: string;
  content: string;
  source: string | null;
  found_at: string;
  content_hash: string;
  created_at: string;
  /** Number of nodes citing this evidence (populated on read) */
  cited_by_count?: number;
  /** Context for why this evidence is relevant to a specific node */
  context?: string | null;
}

export interface Entity {
  name: string;
  type: "country" | "organization" | "person" | "commodity" | "policy" | "other";
  mentions: number;
}

export interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: "causes" | "enables" | "prevents" | "amplifies" | "weakens";
  strength: number; // 0-1
}

export interface Annotation {
  id: string;
  node_id: string | null; // null = free-floating on canvas
  content: string;
  type: "question" | "nudge" | "insight";
  position: { x: number; y: number };
  created_at: string;
}

/** Raw evidence from LLM before normalization into the evidence table */
export interface RawEvidence {
  content: string;
  source: string | null;
  found_at: string;
}

// ---- Engine Types ----

export interface ResearchResult {
  summary: string;
  evidence: RawEvidence[];
  probability_estimate: number;
  confidence: number;
  follow_up_questions: {
    question: string;
    relationship: Edge["relationship"];
    estimated_probability: number;
    reasoning: string;
  }[];
  should_decompose: boolean;
  sub_questions?: string[];
  token_usage?: { input: number; output: number };
}

export interface CritiqueResult {
  critique: string;
  adjusted_probability: number | null;
  adjusted_confidence: number | null;
  counter_questions: {
    question: string;
    relationship: "prevents" | "weakens";
    estimated_probability: number;
    reasoning: string;
  }[];
  token_usage?: { input: number; output: number };
}

// ---- Activity Log ----

export interface ActivityEvent {
  id: string;
  type:
    | "engine_started"
    | "engine_stopped"
    | "research_started"
    | "research_completed"
    | "critique_applied"
    | "question_created"
    | "question_skipped_duplicate"
    | "probability_propagated"
    | "budget_warning"
    | "budget_exhausted";
  node_id: string | null;
  detail: string;
  timestamp: string;
}

// ---- Budget ----

export interface BudgetState {
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  budget_cap_usd: number | null;
}

// ---- Synthesis Types ----

export interface EntityCluster {
  entity: Entity;
  node_ids: string[];
}

export interface AuditFinding {
  type: "contradiction" | "probability_tension" | "gap" | "stale_dependency";
  severity: "high" | "medium" | "low";
  description: string;
  involved_node_ids: string[];
  suggestion: {
    type: "adjust_probability" | "new_edge" | "new_question";
    detail: string;
    node_id?: string;
    suggested_probability?: number;
    source_id?: string;
    target_id?: string;
    relationship?: Edge["relationship"];
    question?: string;
  };
}

export interface AuditResult {
  findings: AuditFinding[];
  timestamp: string;
  token_usage?: { input: number; output: number };
}

export interface BriefingSection {
  theme: string;
  summary: string;
  key_findings: string[];
  probability_table: {
    question: string;
    probability: number;
    confidence: number;
    node_id: string;
  }[];
  entities: string[];
}

export interface Briefing {
  title: string;
  executive_summary: string;
  sections: BriefingSection[];
  methodology_note: string;
  generated_at: string;
  token_usage?: { input: number; output: number };
}

export interface SynthesisResult {
  status: "idle" | "running" | "complete" | "error";
  entities_extracted: number;
  proposed_edges: {
    source_id: string;
    target_id: string;
    relationship: Edge["relationship"];
    reason: string;
  }[];
  audit: AuditResult | null;
  briefing: Briefing | null;
  error?: string;
}

// ---- Belief History ----

export interface BeliefUpdate {
  timestamp: string;
  probability: number;
  confidence: number;
  trigger: "research" | "critic" | "propagation" | "user" | "audit" | "resolution";
  detail: string;
}

// ---- Calibration ----

export interface CalibrationBin {
  bin_start: number;
  bin_end: number;
  predicted_avg: number;
  actual_rate: number;
  count: number;
  node_ids: string[];
}

export interface CalibrationData {
  bins: CalibrationBin[];
  overall_brier: number;
  resolved_count: number;
  timestamp: string;
}

// ---- Base Rate ----

export interface BaseRateResult {
  reference_class: string;
  base_rate: number;
  reasoning: string;
  historical_examples: string[];
  token_usage?: { input: number; output: number };
}

// ---- Operationalization ----

export interface OperationalizationResult {
  operationalized_question: string;
  resolution_criteria: string;
  resolution_date: string;
  reasoning: string;
  token_usage?: { input: number; output: number };
}

export interface PriorityFactors {
  uncertainty: number;
  impact: number;
  voi: number;
  novelty: number;
  staleness: number;
  user_interest: number;
  depth_penalty: number;
}

// ---- API Types ----

export interface GraphState {
  nodes: QuestionNode[];
  edges: Edge[];
  annotations: Annotation[];
}

export interface EngineStatus {
  running: boolean;
  current_question_id: string | null;
  cycles_completed: number;
  last_cycle_at: string | null;
  budget: BudgetState;
}

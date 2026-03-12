// ---- Core Graph Types ----

export interface QuestionNode {
  id: string;
  question: string;
  status: "open" | "researching" | "complete" | "stale";
  probability: number; // 0-1, likelihood this outcome/event occurs
  confidence: number; // 0-1, how confident we are in our probability estimate
  summary: string | null; // Research findings
  evidence: Evidence[];
  depth: number; // Distance from root
  priority_score: number; // Computed by prioritizer
  position: { x: number; y: number }; // Canvas position
  created_at: string;
  updated_at: string;
  researched_at: string | null;
}

export interface Evidence {
  content: string;
  source: string | null;
  found_at: string;
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

// ---- Engine Types ----

export interface ResearchResult {
  summary: string;
  evidence: Evidence[];
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
}

export interface PriorityFactors {
  uncertainty: number; // High uncertainty = more value in researching
  impact: number; // How many downstream nodes depend on this
  novelty: number; // How unexplored is this branch
  staleness: number; // Time since last research
  user_interest: number; // Proximity to user annotations/nudges
  depth_penalty: number; // Slight penalty for going too deep
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
}

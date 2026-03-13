/**
 * Seed scenario: Strait of Hormuz blockade during Iran conflict.
 *
 * Creates a root node and initial first-order cascade questions.
 */

import { v4 as uuid } from "uuid";
import type { QuestionNode, Edge } from "@/types";

export function createHormuzSeed(): { nodes: QuestionNode[]; edges: Edge[] } {
  const now = new Date().toISOString();
  const rootId = uuid();

  const root: QuestionNode = {
    id: rootId,
    question:
      "What are the cascading global effects of the Strait of Hormuz being blocked due to the Iran conflict?",
    status: "open",
    probability: 0.85,
    confidence: 0.7,
    summary: null,
    critique: null,
    evidence: [],
    entities: [],
    depth: 0,
    priority_score: 1.0,
    position: { x: 0, y: 0 },
    created_at: now,
    updated_at: now,
    researched_at: null,
  };

  // First-order cascade questions
  const firstOrder = [
    {
      question: "How will the Hormuz blockade affect global oil prices and supply in the short term (1-3 months)?",
      x: -600,
      y: 300,
    },
    {
      question: "What alternative shipping routes will be used and what are their capacity constraints?",
      x: -200,
      y: 300,
    },
    {
      question: "How will global shipping insurance rates and maritime security costs change?",
      x: 200,
      y: 300,
    },
    {
      question: "What is the impact on LNG exports from Qatar and other Gulf states?",
      x: 600,
      y: 300,
    },
    {
      question: "How will oil-dependent economies (India, Japan, South Korea, China) respond to supply disruption?",
      x: -400,
      y: 350,
    },
    {
      question: "What diplomatic and military escalation pathways are likely in response to the blockade?",
      x: 400,
      y: 350,
    },
  ];

  const nodes: QuestionNode[] = [root];
  const edges: Edge[] = [];

  for (const fq of firstOrder) {
    const childId = uuid();
    nodes.push({
      id: childId,
      question: fq.question,
      status: "open",
      probability: 0.5,
      confidence: 0.1,
      summary: null,
      critique: null,
      evidence: [],
      entities: [],
      depth: 1,
      priority_score: 0,
      position: { x: fq.x, y: fq.y },
      created_at: now,
      updated_at: now,
      researched_at: null,
    });
    edges.push({
      id: uuid(),
      source_id: rootId,
      target_id: childId,
      relationship: "causes",
      strength: 0.7,
    });
  }

  return { nodes, edges };
}

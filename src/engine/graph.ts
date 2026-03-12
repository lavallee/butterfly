import { v4 as uuid } from "uuid";
import type { QuestionNode, Edge, ResearchResult } from "@/types";
import {
  upsertNode,
  insertEdge,
  getNode,
  getChildEdges,
  getAllNodes,
  getAllEdges,
} from "@/lib/db";

/**
 * Create the initial root question for a scenario.
 */
export function createRootNode(question: string): QuestionNode {
  const now = new Date().toISOString();
  const node: QuestionNode = {
    id: uuid(),
    question,
    status: "open",
    probability: 0.5,
    confidence: 0.1,
    summary: null,
    evidence: [],
    depth: 0,
    priority_score: 1.0,
    position: { x: 0, y: 0 },
    created_at: now,
    updated_at: now,
    researched_at: null,
  };
  upsertNode(node);
  return node;
}

/**
 * Apply research results to a node: update its fields and create follow-up nodes.
 */
export function applyResearchResult(
  nodeId: string,
  result: ResearchResult
): { updatedNode: QuestionNode; newNodes: QuestionNode[]; newEdges: Edge[] } {
  const node = getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  const now = new Date().toISOString();

  // Update the researched node
  const updatedNode: QuestionNode = {
    ...node,
    status: "complete",
    probability: result.probability_estimate,
    confidence: result.confidence,
    summary: result.summary,
    evidence: [...node.evidence, ...result.evidence],
    updated_at: now,
    researched_at: now,
  };
  upsertNode(updatedNode);

  // Create follow-up question nodes
  const newNodes: QuestionNode[] = [];
  const newEdges: Edge[] = [];
  const existingChildren = getChildEdges(nodeId);
  const existingQuestions = new Set(
    getAllNodes().map((n) => n.question.toLowerCase())
  );

  for (const fq of result.follow_up_questions) {
    // Skip if we already have a very similar question
    if (existingQuestions.has(fq.question.toLowerCase())) continue;

    const childNode: QuestionNode = {
      id: uuid(),
      question: fq.question,
      status: "open",
      probability: fq.estimated_probability,
      confidence: 0.1,
      summary: null,
      evidence: [],
      depth: node.depth + 1,
      priority_score: 0,
      position: layoutChild(updatedNode, newNodes.length, result.follow_up_questions.length),
      created_at: now,
      updated_at: now,
      researched_at: null,
    };

    const edge: Edge = {
      id: uuid(),
      source_id: nodeId,
      target_id: childNode.id,
      relationship: fq.relationship,
      strength: 0.5,
    };

    upsertNode(childNode);
    insertEdge(edge);
    newNodes.push(childNode);
    newEdges.push(edge);
  }

  return { updatedNode, newNodes, newEdges };
}

/**
 * Get ancestor questions for context (walk up the tree).
 */
export function getAncestorQuestions(nodeId: string, maxDepth = 5): string[] {
  const ancestors: string[] = [];
  let currentId = nodeId;
  const allEdges = getAllEdges();

  for (let i = 0; i < maxDepth; i++) {
    const parentEdge = allEdges.find((e) => e.target_id === currentId);
    if (!parentEdge) break;

    const parent = getNode(parentEdge.source_id);
    if (!parent) break;

    ancestors.unshift(parent.question);
    currentId = parent.id;
  }

  return ancestors;
}

/**
 * Get sibling questions (other children of the same parent).
 */
export function getSiblingQuestions(nodeId: string): string[] {
  const allEdges = getAllEdges();
  const parentEdge = allEdges.find((e) => e.target_id === nodeId);
  if (!parentEdge) return [];

  const siblingEdges = allEdges.filter(
    (e) => e.source_id === parentEdge.source_id && e.target_id !== nodeId
  );

  return siblingEdges
    .map((e) => getNode(e.target_id))
    .filter((n): n is QuestionNode => n !== null)
    .map((n) => n.question);
}

/**
 * Simple radial layout for child nodes around a parent.
 */
function layoutChild(
  parent: QuestionNode,
  index: number,
  total: number
): { x: number; y: number } {
  const radius = 300;
  const startAngle = -Math.PI / 2;
  const spread = Math.min(Math.PI, (total - 1) * 0.4) || Math.PI / 4;
  const angle =
    total === 1
      ? startAngle + Math.PI / 2
      : startAngle + (index / (total - 1)) * spread + (Math.PI - spread) / 2;

  return {
    x: parent.position.x + Math.cos(angle) * radius,
    y: parent.position.y + Math.sin(angle) * radius + 200,
  };
}

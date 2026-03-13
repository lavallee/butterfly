import { getAllNodes } from "@/lib/db";

/**
 * Detect if a question is too similar to an existing one.
 * Uses normalized keyword overlap — fast, no vector DB needed.
 */

const SIMILARITY_THRESHOLD = 0.7;

export function isDuplicate(newQuestion: string): {
  duplicate: boolean;
  matchedQuestion?: string;
  similarity?: number;
} {
  const existing = getAllNodes();
  const newTokens = tokenize(newQuestion);

  for (const node of existing) {
    const existingTokens = tokenize(node.question);
    const sim = jaccardSimilarity(newTokens, existingTokens);

    if (sim > SIMILARITY_THRESHOLD) {
      return {
        duplicate: true,
        matchedQuestion: node.question,
        similarity: sim,
      };
    }
  }

  return { duplicate: false };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
  "was", "one", "our", "out", "has", "had", "how", "its", "may", "who",
  "did", "get", "him", "his", "she", "they", "this", "that", "with",
  "have", "from", "been", "will", "what", "when", "where", "which", "their",
  "would", "could", "should", "about", "these", "those", "being", "there",
  "does", "into", "more", "than", "them", "then", "very",
]);

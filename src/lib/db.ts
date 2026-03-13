import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import type {
  QuestionNode,
  Edge,
  Annotation,
  Evidence,
  GraphState,
  ActivityEvent,
} from "@/types";

const DB_PATH = path.join(process.cwd(), "data", "butterfly.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      probability REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.1,
      summary TEXT,
      critique TEXT,
      evidence TEXT NOT NULL DEFAULT '[]',
      depth INTEGER NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      researched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES nodes(id),
      target_id TEXT NOT NULL REFERENCES nodes(id),
      relationship TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0.5
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      node_id TEXT REFERENCES nodes(id),
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS engine_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      node_id TEXT,
      detail TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);

  // Migrations for existing DBs
  try { db.exec("ALTER TABLE nodes ADD COLUMN critique TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN entities TEXT NOT NULL DEFAULT '[]'"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN operationalized_question TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN resolution_criteria TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN resolution_date TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN resolved_at TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN resolved_as TEXT"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN brier_score REAL"); } catch {}
  try { db.exec("ALTER TABLE nodes ADD COLUMN base_rate REAL"); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, node_id TEXT, detail TEXT NOT NULL, timestamp TEXT NOT NULL
  )`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS belief_history (
    id TEXT PRIMARY KEY, node_id TEXT NOT NULL, timestamp TEXT NOT NULL,
    probability REAL NOT NULL, confidence REAL NOT NULL, trigger TEXT NOT NULL, detail TEXT NOT NULL
  )`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_belief_history_node ON belief_history(node_id, timestamp)"); } catch {}

  // Evidence normalization tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT,
      found_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_hash ON evidence(content_hash);

    CREATE TABLE IF NOT EXISTS node_evidence (
      node_id TEXT NOT NULL REFERENCES nodes(id),
      evidence_id TEXT NOT NULL REFERENCES evidence(id),
      context TEXT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (node_id, evidence_id)
    );
    CREATE INDEX IF NOT EXISTS idx_node_evidence_evidence ON node_evidence(evidence_id);
  `);

  // Migrate existing JSON evidence into normalized tables
  migrateJsonEvidence(db);
}

function migrateJsonEvidence(db: Database.Database) {
  // Check if migration already ran
  const migrated = db.prepare(
    "SELECT value FROM engine_state WHERE key = 'evidence_migrated'"
  ).get() as any;
  if (migrated) return;

  const rows = db.prepare("SELECT id, evidence FROM nodes").all() as any[];
  const insertEv = db.prepare(
    "INSERT OR IGNORE INTO evidence (id, content, source, found_at, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO node_evidence (node_id, evidence_id, context, added_at) VALUES (?, ?, ?, ?)"
  );
  const now = new Date().toISOString();

  const migrate = db.transaction(() => {
    for (const row of rows) {
      let items: any[];
      try {
        items = JSON.parse(row.evidence || "[]");
      } catch {
        continue;
      }
      for (const item of items) {
        if (!item.content) continue;
        const hash = hashContent(item.content);
        const id = `ev_${hash.slice(0, 16)}`;
        insertEv.run(id, item.content, item.source || null, item.found_at || now, hash, now);
        insertLink.run(row.id, id, null, item.found_at || now);
      }
    }
    db.prepare(
      "INSERT OR IGNORE INTO engine_state (key, value) VALUES ('evidence_migrated', ?)"
    ).run(now);
  });

  migrate();
}

// ---- Node operations ----

export function getAllNodes(): QuestionNode[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM nodes").all() as any[];
  return rows.map(rowToNode);
}

export function getNode(id: string): QuestionNode | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as any;
  return row ? rowToNode(row) : null;
}

export function upsertNode(node: QuestionNode): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO nodes (id, question, status, probability, confidence, summary, critique, evidence, entities, depth, priority_score, position_x, position_y, operationalized_question, resolution_criteria, resolution_date, resolved_at, resolved_as, brier_score, base_rate, created_at, updated_at, researched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      question=excluded.question, status=excluded.status, probability=excluded.probability,
      confidence=excluded.confidence, summary=excluded.summary, critique=excluded.critique,
      evidence=excluded.evidence, entities=excluded.entities, depth=excluded.depth, priority_score=excluded.priority_score,
      position_x=excluded.position_x, position_y=excluded.position_y,
      operationalized_question=excluded.operationalized_question, resolution_criteria=excluded.resolution_criteria,
      resolution_date=excluded.resolution_date, resolved_at=excluded.resolved_at, resolved_as=excluded.resolved_as,
      brier_score=excluded.brier_score, base_rate=excluded.base_rate,
      updated_at=excluded.updated_at, researched_at=excluded.researched_at
  `).run(
    node.id,
    node.question,
    node.status,
    node.probability,
    node.confidence,
    node.summary,
    node.critique,
    JSON.stringify(node.evidence),
    JSON.stringify(node.entities),
    node.depth,
    node.priority_score,
    node.position.x,
    node.position.y,
    node.operationalized_question,
    node.resolution_criteria,
    node.resolution_date,
    node.resolved_at,
    node.resolved_as,
    node.brier_score,
    node.base_rate,
    node.created_at,
    node.updated_at,
    node.researched_at
  );
}

export function getOpenQuestions(): QuestionNode[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM nodes WHERE status = 'open' ORDER BY priority_score DESC")
    .all() as any[];
  return rows.map(rowToNode);
}

// ---- Edge operations ----

export function getAllEdges(): Edge[] {
  const db = getDb();
  return db.prepare("SELECT * FROM edges").all() as Edge[];
}

export function insertEdge(edge: Edge): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO edges (id, source_id, target_id, relationship, strength) VALUES (?, ?, ?, ?, ?)"
  ).run(edge.id, edge.source_id, edge.target_id, edge.relationship, edge.strength);
}

export function getChildEdges(nodeId: string): Edge[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM edges WHERE source_id = ?")
    .all(nodeId) as Edge[];
}

export function getParentEdges(nodeId: string): Edge[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM edges WHERE target_id = ?")
    .all(nodeId) as Edge[];
}

// ---- Annotation operations ----

export function getAllAnnotations(): Annotation[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM annotations").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    node_id: r.node_id,
    content: r.content,
    type: r.type,
    position: { x: r.position_x, y: r.position_y },
    created_at: r.created_at,
  }));
}

export function insertAnnotation(a: Annotation): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO annotations (id, node_id, content, type, position_x, position_y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(a.id, a.node_id, a.content, a.type, a.position.x, a.position.y, a.created_at);
}

// ---- Engine state ----

export function getEngineState(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM engine_state WHERE key = ?")
    .get(key) as any;
  return row?.value ?? null;
}

export function setEngineState(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO engine_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, value);
}

// ---- Full graph ----

export function getFullGraph(): GraphState {
  return {
    nodes: getAllNodes(),
    edges: getAllEdges(),
    annotations: getAllAnnotations(),
  };
}

// ---- Evidence operations ----

function hashContent(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Insert evidence, deduplicating by content hash.
 * Returns the evidence record (existing or new).
 */
export function insertEvidence(content: string, source: string | null, foundAt?: string): Evidence {
  const db = getDb();
  const hash = hashContent(content);
  const now = foundAt || new Date().toISOString();

  // Check for exact duplicate
  const existing = db.prepare("SELECT * FROM evidence WHERE content_hash = ?").get(hash) as any;
  if (existing) {
    return {
      id: existing.id,
      content: existing.content,
      source: existing.source,
      found_at: existing.found_at,
      content_hash: existing.content_hash,
      created_at: existing.created_at,
    };
  }

  // Check for near-duplicate via Jaccard on word tokens
  const nearDup = findNearDuplicateEvidence(content, db);
  if (nearDup) {
    return nearDup;
  }

  const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO evidence (id, content, source, found_at, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, content, source, now, hash, now);

  return { id, content, source, found_at: now, content_hash: hash, created_at: now };
}

function findNearDuplicateEvidence(content: string, db: Database.Database): Evidence | null {
  const THRESHOLD = 0.8;
  const newTokens = tokenizeEvidence(content);
  if (newTokens.size === 0) return null;

  // Only check recent evidence (last 500) to keep this fast
  const candidates = db.prepare(
    "SELECT * FROM evidence ORDER BY created_at DESC LIMIT 500"
  ).all() as any[];

  for (const row of candidates) {
    const existingTokens = tokenizeEvidence(row.content);
    const intersection = [...newTokens].filter((t) => existingTokens.has(t)).length;
    const union = new Set([...newTokens, ...existingTokens]).size;
    const sim = union === 0 ? 0 : intersection / union;

    if (sim >= THRESHOLD) {
      return {
        id: row.id,
        content: row.content,
        source: row.source,
        found_at: row.found_at,
        content_hash: row.content_hash,
        created_at: row.created_at,
      };
    }
  }
  return null;
}

function tokenizeEvidence(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 2)
  );
}

/**
 * Link an evidence record to a node.
 */
export function linkEvidenceToNode(nodeId: string, evidenceId: string, context?: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO node_evidence (node_id, evidence_id, context, added_at) VALUES (?, ?, ?, ?)"
  ).run(nodeId, evidenceId, context || null, now);
}

/**
 * Get all evidence for a node, with cross-reference counts.
 */
export function getEvidenceForNode(nodeId: string): Evidence[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT e.*, ne.context,
      (SELECT COUNT(*) FROM node_evidence ne2 WHERE ne2.evidence_id = e.id) as cited_by_count
    FROM evidence e
    JOIN node_evidence ne ON ne.evidence_id = e.id
    WHERE ne.node_id = ?
    ORDER BY ne.added_at ASC
  `).all(nodeId) as any[];

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    source: r.source,
    found_at: r.found_at,
    content_hash: r.content_hash,
    created_at: r.created_at,
    cited_by_count: r.cited_by_count,
    context: r.context,
  }));
}

/**
 * Get nodes that cite a specific evidence record.
 */
export function getNodesForEvidence(evidenceId: string): { nodeId: string; question: string }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT n.id as node_id, n.question
    FROM nodes n
    JOIN node_evidence ne ON ne.node_id = n.id
    WHERE ne.evidence_id = ?
    ORDER BY ne.added_at ASC
  `).all(evidenceId) as any[];

  return rows.map((r) => ({ nodeId: r.node_id, question: r.question }));
}

/**
 * Get aggregate evidence stats.
 */
export function getEvidenceStats(): {
  total: number;
  unique_sources: number;
  most_cited: { id: string; content: string; count: number }[];
} {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM evidence").get() as any).c;
  const unique_sources = (db.prepare(
    "SELECT COUNT(DISTINCT source) as c FROM evidence WHERE source IS NOT NULL"
  ).get() as any).c;
  const most_cited = db.prepare(`
    SELECT e.id, e.content, COUNT(ne.node_id) as count
    FROM evidence e
    JOIN node_evidence ne ON ne.evidence_id = e.id
    GROUP BY e.id
    ORDER BY count DESC
    LIMIT 10
  `).all() as any[];

  return { total, unique_sources, most_cited };
}

// ---- Helpers ----

function rowToNode(row: any): QuestionNode {
  return {
    id: row.id,
    question: row.question,
    status: row.status,
    probability: row.probability,
    confidence: row.confidence,
    summary: row.summary,
    critique: row.critique || null,
    evidence: getEvidenceForNode(row.id),
    entities: JSON.parse(row.entities || "[]"),
    depth: row.depth,
    priority_score: row.priority_score,
    position: { x: row.position_x, y: row.position_y },
    operationalized_question: row.operationalized_question || null,
    resolution_criteria: row.resolution_criteria || null,
    resolution_date: row.resolution_date || null,
    resolved_at: row.resolved_at || null,
    resolved_as: row.resolved_as || null,
    brier_score: row.brier_score ?? null,
    base_rate: row.base_rate ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    researched_at: row.researched_at,
  };
}

// ---- Activity Log ----

export function logActivity(
  type: ActivityEvent["type"],
  detail: string,
  nodeId?: string
): void {
  const db = getDb();
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO activity_log (id, type, node_id, detail, timestamp) VALUES (?, ?, ?, ?, ?)"
  ).run(id, type, nodeId || null, detail, new Date().toISOString());
}

// ---- Synthesis Storage ----

export function getSynthesisResult(): any | null {
  const json = getEngineState("synthesis_result");
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function setSynthesisResult(result: any): void {
  setEngineState("synthesis_result", JSON.stringify(result));
}

// ---- Activity Log ----

// ---- Belief History ----

export function recordBeliefUpdate(
  nodeId: string,
  probability: number,
  confidence: number,
  trigger: string,
  detail: string
): void {
  const db = getDb();
  const id = `bh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO belief_history (id, node_id, timestamp, probability, confidence, trigger, detail) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, nodeId, new Date().toISOString(), probability, confidence, trigger, detail);
}

export function getBeliefHistory(nodeId: string): any[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM belief_history WHERE node_id = ? ORDER BY timestamp ASC")
    .all(nodeId) as any[];
}

export function getActivityLog(limit = 100): ActivityEvent[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as ActivityEvent[];
}

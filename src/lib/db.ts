import Database from "better-sqlite3";
import path from "path";
import type {
  QuestionNode,
  Edge,
  Annotation,
  Evidence,
  GraphState,
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
  `);
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
    INSERT INTO nodes (id, question, status, probability, confidence, summary, evidence, depth, priority_score, position_x, position_y, created_at, updated_at, researched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      question=excluded.question, status=excluded.status, probability=excluded.probability,
      confidence=excluded.confidence, summary=excluded.summary, evidence=excluded.evidence,
      depth=excluded.depth, priority_score=excluded.priority_score,
      position_x=excluded.position_x, position_y=excluded.position_y,
      updated_at=excluded.updated_at, researched_at=excluded.researched_at
  `).run(
    node.id,
    node.question,
    node.status,
    node.probability,
    node.confidence,
    node.summary,
    JSON.stringify(node.evidence),
    node.depth,
    node.priority_score,
    node.position.x,
    node.position.y,
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

// ---- Helpers ----

function rowToNode(row: any): QuestionNode {
  return {
    id: row.id,
    question: row.question,
    status: row.status,
    probability: row.probability,
    confidence: row.confidence,
    summary: row.summary,
    evidence: JSON.parse(row.evidence),
    depth: row.depth,
    priority_score: row.priority_score,
    position: { x: row.position_x, y: row.position_y },
    created_at: row.created_at,
    updated_at: row.updated_at,
    researched_at: row.researched_at,
  };
}

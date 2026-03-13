"use client";

import { useState, useEffect, useCallback } from "react";
import type { QuestionNode, BeliefUpdate, Evidence } from "@/types";

const ENTITY_BG: Record<string, string> = {
  country: "#0f2a1f",
  organization: "#1a1a2e",
  person: "#2a1a0f",
  commodity: "#2a2a0f",
  policy: "#1a0f2a",
};

const ENTITY_BORDER: Record<string, string> = {
  country: "#22c55e40",
  organization: "#3b82f640",
  person: "#f59e0b40",
  commodity: "#eab30840",
  policy: "#8b5cf640",
};

const ENTITY_COLOR: Record<string, string> = {
  country: "#86efac",
  organization: "#93c5fd",
  person: "#fcd34d",
  commodity: "#fde047",
  policy: "#c4b5fd",
};

interface Props {
  node: QuestionNode | null;
  onClose: () => void;
  onAnnotate: (nodeId: string, content: string, type: string) => void;
  onResolve?: (nodeId: string, resolvedAs: "yes" | "no" | "partial") => void;
  onNodeFocus?: (nodeId: string) => void;
}

export default function EvidencePanel({ node, onClose, onAnnotate, onResolve, onNodeFocus }: Props) {
  const [annotationText, setAnnotationText] = useState("");
  const [annotationType, setAnnotationType] = useState<string>("question");
  const [beliefHistory, setBeliefHistory] = useState<BeliefUpdate[]>([]);

  // Fetch belief history when node changes
  useEffect(() => {
    if (!node) return;
    setBeliefHistory([]);
    fetch(`/api/graph?belief_history=${node.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setBeliefHistory(data);
      })
      .catch(() => {});
  }, [node?.id]);

  if (!node) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 420,
        background: "#111111",
        borderLeft: "1px solid #262626",
        padding: 24,
        overflowY: "auto",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#737373",
          }}
        >
          Evidence Panel
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#737373",
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>

      {/* Question */}
      <h2 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>
        {node.question}
      </h2>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
        <div>
          <span style={{ color: "#737373" }}>Probability: </span>
          <span style={{ fontWeight: 600 }}>
            {(node.probability * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <span style={{ color: "#737373" }}>Confidence: </span>
          <span style={{ fontWeight: 600 }}>
            {(node.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <span style={{ color: "#737373" }}>Depth: </span>
          <span>{node.depth}</span>
        </div>
      </div>

      {/* Operationalized Question */}
      {node.operationalized_question && (
        <div>
          <h3 style={sectionHeaderStyle}>Operationalized Question</h3>
          <div style={{ fontSize: 13, color: "#93c5fd", lineHeight: 1.6, fontStyle: "italic" }}>
            {node.operationalized_question}
          </div>
          {node.resolution_criteria && (
            <div style={{ fontSize: 11, color: "#737373", marginTop: 4 }}>
              Resolution: {node.resolution_criteria}
            </div>
          )}
          {node.resolution_date && (
            <div style={{ fontSize: 11, color: "#525252", marginTop: 2 }}>
              By: {node.resolution_date}
            </div>
          )}
        </div>
      )}

      {/* Base Rate */}
      {node.base_rate !== null && node.base_rate !== undefined && (
        <div style={{
          background: "#0f1a0f",
          border: "1px solid #22c55e30",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 12,
        }}>
          <span style={{ color: "#737373" }}>Base rate anchor: </span>
          <span style={{ color: "#86efac", fontWeight: 600 }}>{(node.base_rate * 100).toFixed(0)}%</span>
          <span style={{ color: "#525252", marginLeft: 8 }}>
            (current estimate: {(node.probability * 100).toFixed(0)}%)
          </span>
        </div>
      )}

      {/* Belief History Sparkline */}
      {beliefHistory.length > 1 && (
        <div>
          <h3 style={sectionHeaderStyle}>Belief History</h3>
          <BeliefSparkline history={beliefHistory} />
        </div>
      )}

      {/* Resolution Controls */}
      {node.status !== "resolved" && node.status === "complete" && (
        <div>
          <h3 style={sectionHeaderStyle}>Resolve Question</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {(["yes", "no", "partial"] as const).map((r) => (
              <button
                key={r}
                onClick={() => onResolve?.(node.id, r)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 500,
                  border: "1px solid",
                  borderColor: r === "yes" ? "#22c55e40" : r === "no" ? "#ef444440" : "#f59e0b40",
                  background: r === "yes" ? "#0f1a0f" : r === "no" ? "#1a0f0f" : "#1a1a0f",
                  color: r === "yes" ? "#86efac" : r === "no" ? "#fca5a5" : "#fcd34d",
                  textTransform: "capitalize",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resolved Status */}
      {node.status === "resolved" && (
        <div style={{
          background: "#0f0f1a",
          border: "1px solid #3b82f640",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 12,
        }}>
          <span style={{ color: "#737373" }}>Resolved: </span>
          <span style={{
            fontWeight: 600,
            color: node.resolved_as === "yes" ? "#86efac" : node.resolved_as === "no" ? "#fca5a5" : "#fcd34d",
          }}>
            {node.resolved_as}
          </span>
          {node.brier_score !== null && (
            <span style={{ color: "#525252", marginLeft: 12 }}>
              Brier: {node.brier_score?.toFixed(3)}
            </span>
          )}
          {node.resolved_at && (
            <span style={{ color: "#525252", marginLeft: 12 }}>
              {new Date(node.resolved_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      {node.summary && (
        <div>
          <h3
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#737373",
              marginBottom: 8,
            }}
          >
            Research Summary
          </h3>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: "#d4d4d4",
              whiteSpace: "pre-wrap",
            }}
          >
            {node.summary}
          </div>
        </div>
      )}

      {/* Critique */}
      {node.critique && (
        <div>
          <h3
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#737373",
              marginBottom: 8,
            }}
          >
            Critic Assessment
          </h3>
          <div
            style={{
              background: "#1a1a0a",
              border: "1px solid #333300",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "#fcd34d",
            }}
          >
            {node.critique}
          </div>
        </div>
      )}

      {/* Evidence */}
      {node.evidence.length > 0 && (
        <div>
          <h3 style={sectionHeaderStyle}>
            Evidence ({node.evidence.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {node.evidence.map((e, i) => (
              <EvidenceCard
                key={e.id || i}
                evidence={e}
                currentNodeId={node.id}
                onNodeFocus={onNodeFocus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Entities */}
      {node.entities && node.entities.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#737373",
              marginBottom: 8,
            }}
          >
            Entities ({node.entities.length})
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {node.entities.map((e, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  background: ENTITY_BG[e.type] || "#1a1a1a",
                  border: `1px solid ${ENTITY_BORDER[e.type] || "#333"}`,
                  color: ENTITY_COLOR[e.type] || "#a3a3a3",
                }}
              >
                {e.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add annotation */}
      <div
        style={{
          borderTop: "1px solid #262626",
          paddingTop: 16,
          marginTop: "auto",
        }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#737373",
            marginBottom: 8,
          }}
        >
          Add Annotation
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["question", "nudge", "insight"].map((t) => (
            <button
              key={t}
              onClick={() => setAnnotationType(t)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid",
                borderColor: annotationType === t ? "#3b82f6" : "#333",
                background: annotationType === t ? "#1e3a5f" : "transparent",
                color: annotationType === t ? "#93c5fd" : "#737373",
                fontSize: 11,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={annotationText}
          onChange={(e) => setAnnotationText(e.target.value)}
          placeholder={
            annotationType === "question"
              ? "What follow-up should the engine explore?"
              : annotationType === "nudge"
                ? "Steer the research in a direction..."
                : "Note an insight or connection..."
          }
          style={{
            width: "100%",
            minHeight: 80,
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 6,
            padding: 10,
            fontSize: 13,
            color: "#e5e5e5",
            resize: "vertical",
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            if (annotationText.trim()) {
              onAnnotate(node.id, annotationText.trim(), annotationType);
              setAnnotationText("");
            }
          }}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function EvidenceCard({
  evidence,
  currentNodeId,
  onNodeFocus,
}: {
  evidence: Evidence;
  currentNodeId: string;
  onNodeFocus?: (nodeId: string) => void;
}) {
  const [crossRefs, setCrossRefs] = useState<{ nodeId: string; question: string }[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  const citedByCount = evidence.cited_by_count || 0;
  const hasMultipleCitations = citedByCount > 1;

  const loadCrossRefs = useCallback(() => {
    if (!evidence.id || crossRefs) return;
    fetch(`/api/evidence?evidence_id=${evidence.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCrossRefs(data.filter((d: any) => d.nodeId !== currentNodeId));
        }
      })
      .catch(() => {});
  }, [evidence.id, currentNodeId, crossRefs]);

  const handleBadgeClick = () => {
    if (!expanded) loadCrossRefs();
    setExpanded(!expanded);
  };

  return (
    <div
      style={{
        background: "#1a1a1a",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        lineHeight: 1.5,
        borderLeft: hasMultipleCitations ? "3px solid #8b5cf640" : undefined,
      }}
    >
      <div style={{ color: "#d4d4d4" }}>{evidence.content}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <div>
          {evidence.source && (
            <span style={{ color: "#525252", fontSize: 11 }}>— {evidence.source}</span>
          )}
        </div>
        {hasMultipleCitations && (
          <button
            onClick={handleBadgeClick}
            style={{
              background: "#1a1a2e",
              border: "1px solid #3b82f630",
              borderRadius: 10,
              padding: "1px 8px",
              fontSize: 10,
              color: "#93c5fd",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Cited by {citedByCount} nodes {expanded ? "▴" : "▾"}
          </button>
        )}
      </div>
      {expanded && crossRefs && crossRefs.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #262626" }}>
          {crossRefs.map((ref) => (
            <div
              key={ref.nodeId}
              onClick={() => onNodeFocus?.(ref.nodeId)}
              style={{
                fontSize: 11,
                color: "#8b5cf6",
                cursor: "pointer",
                padding: "2px 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              → {ref.question.length > 60 ? ref.question.slice(0, 60) + "..." : ref.question}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#737373",
  marginBottom: 8,
};

function BeliefSparkline({ history }: { history: BeliefUpdate[] }) {
  const W = 370;
  const H = 60;
  const PAD = 2;

  if (history.length < 2) return null;

  const points = history.map((h, i) => ({
    x: PAD + (i / (history.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - h.probability) * (H - PAD * 2),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const TRIGGER_COLORS: Record<string, string> = {
    research: "#3b82f6",
    critic: "#f59e0b",
    propagation: "#8b5cf6",
    user: "#22c55e",
    audit: "#ef4444",
    resolution: "#ec4899",
  };

  return (
    <div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Grid lines at 25%, 50%, 75% */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + (1 - p) * (H - PAD * 2)}
            y2={PAD + (1 - p) * (H - PAD * 2)}
            stroke="#1a1a1a"
            strokeWidth={1}
          />
        ))}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={TRIGGER_COLORS[history[i].trigger] || "#737373"}
          >
            <title>
              {history[i].trigger}: P={history[i].probability.toFixed(2)} — {history[i].detail?.slice(0, 80)}
            </title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
        {Object.entries(TRIGGER_COLORS).map(([trigger, color]) => {
          if (!history.some((h) => h.trigger === trigger)) return null;
          return (
            <span key={trigger} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#525252" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
              {trigger}
            </span>
          );
        })}
      </div>
    </div>
  );
}

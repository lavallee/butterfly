"use client";

import type { SynthesisResult } from "@/types";

const SEVERITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#737373",
};

const FINDING_TYPE_LABELS: Record<string, string> = {
  contradiction: "Contradiction",
  probability_tension: "Probability Tension",
  gap: "Gap",
  stale_dependency: "Stale Dependency",
};

interface Props {
  result: SynthesisResult;
  onClose: () => void;
  onApplyEdges: () => void;
  onApplyAdjustments: () => void;
  onNodeFocus?: (nodeId: string) => void;
}

export default function BriefingPanel({
  result,
  onClose,
  onApplyEdges,
  onApplyAdjustments,
  onNodeFocus,
}: Props) {
  const { briefing, audit, proposed_edges } = result;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        background: "rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          width: "min(900px, 90vw)",
          background: "#111111",
          borderLeft: "1px solid #262626",
          borderRight: "1px solid #262626",
          overflowY: "auto",
          padding: "32px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#737373",
              }}
            >
              Synthesis Briefing
            </span>
            {briefing && (
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 0", lineHeight: 1.3 }}>
                {briefing.title}
              </h1>
            )}
            {briefing?.generated_at && (
              <span style={{ fontSize: 11, color: "#525252" }}>
                Generated {new Date(briefing.generated_at).toLocaleString()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#737373",
              cursor: "pointer",
              fontSize: 24,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Executive Summary */}
        {briefing?.executive_summary && (
          <div>
            <SectionHeader>Executive Summary</SectionHeader>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.8,
                color: "#e5e5e5",
                whiteSpace: "pre-wrap",
              }}
            >
              {briefing.executive_summary}
            </div>
          </div>
        )}

        {/* Theme Sections */}
        {briefing?.sections.map((section, i) => (
          <div
            key={i}
            style={{
              background: "#0a0a0a",
              border: "1px solid #1a1a1a",
              borderRadius: 8,
              padding: "20px 24px",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#e5e5e5" }}>
              {section.theme}
            </h3>

            {section.entities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
                {section.entities.map((e, j) => (
                  <span
                    key={j}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 10,
                      background: "#1a1a1a",
                      border: "1px solid #333",
                      color: "#a3a3a3",
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}

            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "#d4d4d4",
                margin: "12px 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {section.summary}
            </div>

            {section.key_findings.length > 0 && (
              <div style={{ margin: "12px 0" }}>
                <SubHeader>Key Findings</SubHeader>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {section.key_findings.map((f, j) => (
                    <li key={j} style={{ fontSize: 13, color: "#d4d4d4", lineHeight: 1.6, marginBottom: 4 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {section.probability_table.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <SubHeader>Probability Estimates</SubHeader>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #262626" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: "#737373", fontWeight: 500 }}>
                        Question
                      </th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#737373", fontWeight: 500, width: 60 }}>
                        P
                      </th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#737373", fontWeight: 500, width: 60 }}>
                        C
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.probability_table.map((row, j) => (
                      <tr
                        key={j}
                        style={{
                          borderBottom: "1px solid #1a1a1a",
                          cursor: row.node_id ? "pointer" : "default",
                        }}
                        onClick={() => row.node_id && onNodeFocus?.(row.node_id)}
                      >
                        <td style={{ padding: "6px 8px", color: "#d4d4d4" }}>{row.question}</td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: probColor(row.probability), fontWeight: 600 }}>
                          {(row.probability * 100).toFixed(0)}%
                        </td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: "#a3a3a3" }}>
                          {(row.confidence * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {/* Audit Findings */}
        {audit && audit.findings.length > 0 && (
          <div>
            <SectionHeader>Audit Findings ({audit.findings.length})</SectionHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {audit.findings.map((finding, i) => (
                <div
                  key={i}
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1a1a1a",
                    borderLeft: `3px solid ${SEVERITY_COLORS[finding.severity] || "#333"}`,
                    borderRadius: 6,
                    padding: "10px 14px",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: SEVERITY_COLORS[finding.severity],
                      }}
                    >
                      {finding.severity}
                    </span>
                    <span style={{ fontSize: 11, color: "#737373" }}>
                      {FINDING_TYPE_LABELS[finding.type] || finding.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#d4d4d4", lineHeight: 1.5 }}>
                    {finding.description}
                  </div>
                  {finding.suggestion.detail && (
                    <div style={{ fontSize: 12, color: "#a3a3a3", marginTop: 6, fontStyle: "italic" }}>
                      Suggestion: {finding.suggestion.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {audit.findings.some((f) => f.suggestion.type === "adjust_probability") && (
              (result as any)._adjustmentsApplied != null ? (
                <div style={{ fontSize: 12, color: "#22c55e", marginTop: 12 }}>
                  Applied {(result as any)._adjustmentsApplied} probability adjustments.
                </div>
              ) : (
                <button onClick={onApplyAdjustments} style={{ ...actionBtnStyle, marginTop: 12 }}>
                  Apply Probability Adjustments
                </button>
              )
            )}
          </div>
        )}

        {/* Proposed Cross-Branch Edges */}
        {((result as any)._edgesApplied != null || proposed_edges.length > 0) && (
          <div>
            <SectionHeader>
              Cross-Branch Connections
              {proposed_edges.length > 0 && ` (${proposed_edges.length} proposed)`}
            </SectionHeader>
            {proposed_edges.length > 0 ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {proposed_edges.map((edge, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: "#a3a3a3",
                        padding: "6px 10px",
                        background: "#0a0a0a",
                        borderRadius: 4,
                        border: "1px solid #1a1a1a",
                      }}
                    >
                      <span style={{ color: "#8b5cf6" }}>{edge.relationship}</span>{" "}
                      — {edge.reason}
                    </div>
                  ))}
                </div>
                <button onClick={onApplyEdges} style={{ ...actionBtnStyle, marginTop: 12 }}>
                  Apply All Proposed Edges
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#22c55e" }}>
                Applied {(result as any)._edgesApplied ?? ""} edges to the graph.
              </div>
            )}
          </div>
        )}

        {/* Methodology */}
        {briefing?.methodology_note && (
          <div
            style={{
              fontSize: 12,
              color: "#525252",
              borderTop: "1px solid #262626",
              paddingTop: 16,
              lineHeight: 1.5,
            }}
          >
            {briefing.methodology_note}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "#737373",
        marginBottom: 12,
      }}
    >
      {children}
    </h3>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "#525252",
        marginBottom: 8,
      }}
    >
      {children}
    </h4>
  );
}

function probColor(p: number): string {
  if (p >= 0.7) return "#22c55e";
  if (p >= 0.4) return "#f59e0b";
  return "#ef4444";
}

const actionBtnStyle = {
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 500 as const,
  background: "#1e3a5f",
  borderColor: "#3b82f6",
  border: "1px solid #3b82f6",
  color: "#93c5fd",
};

"use client";

import { useCallback, useEffect, useState } from "react";

type AnalysisType = "sensitivity" | "convergence" | "whatif" | "timeline" | "montecarlo" | "voi";

interface Props {
  onClose: () => void;
  onNodeFocus?: (nodeId: string) => void;
}

const TABS: { key: AnalysisType; label: string; llm: boolean }[] = [
  { key: "sensitivity", label: "Sensitivity", llm: false },
  { key: "convergence", label: "Convergence", llm: false },
  { key: "whatif", label: "What-If", llm: false },
  { key: "timeline", label: "Timeline", llm: true },
  { key: "montecarlo", label: "Monte Carlo", llm: false },
  { key: "voi", label: "Value of Info", llm: false },
];

export default function AnalysisPanel({ onClose, onNodeFocus }: Props) {
  const [activeTab, setActiveTab] = useState<AnalysisType>("sensitivity");
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Load persisted results on mount
  useEffect(() => {
    async function loadAll() {
      for (const tab of TABS) {
        try {
          const res = await fetch(`/api/analysis?type=${tab.key}`);
          const data = await res.json();
          if (data && data.status !== "not_run") {
            setResults((p) => ({ ...p, [tab.key]: data }));
          }
        } catch {}
      }
    }
    loadAll();
  }, []);

  // What-if state
  const [whatIfNodeId, setWhatIfNodeId] = useState("");
  const [whatIfProb, setWhatIfProb] = useState("0.5");
  const [whatIfName, setWhatIfName] = useState("Custom scenario");

  const runAnalysis = async (type: AnalysisType, body?: any) => {
    setLoading((p) => ({ ...p, [type]: true }));
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...body }),
      });
      const data = await res.json();
      setResults((p) => ({ ...p, [type]: data }));
    } catch (err) {
      console.error(`Analysis ${type} failed:`, err);
    }
    setLoading((p) => ({ ...p, [type]: false }));
  };

  const data = results[activeTab];
  const isLoading = loading[activeTab];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          width: "min(1000px, 92vw)",
          background: "#111111",
          borderLeft: "1px solid #262626",
          borderRight: "1px solid #262626",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid #262626",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>
            Analysis
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#737373", cursor: "pointer", fontSize: 22 }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid #262626",
            flexShrink: 0,
            padding: "0 24px",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 16px",
                fontSize: 12,
                cursor: "pointer",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
                color: activeTab === tab.key ? "#93c5fd" : "#737373",
                fontWeight: activeTab === tab.key ? 600 : 400,
              }}
            >
              {tab.label}
              {tab.llm && <span style={{ fontSize: 9, color: "#525252", marginLeft: 4 }}>LLM</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          {/* Run button */}
          {activeTab !== "whatif" && (
            <button
              onClick={() => runAnalysis(activeTab)}
              disabled={isLoading}
              style={{
                ...btnStyle,
                marginBottom: 20,
                opacity: isLoading ? 0.5 : 1,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? "Running..." : `Run ${TABS.find((t) => t.key === activeTab)?.label} Analysis`}
            </button>
          )}

          {/* What-if has custom inputs */}
          {activeTab === "whatif" && (
            <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={labelStyle}>Scenario Name</label>
                <input
                  value={whatIfName}
                  onChange={(e) => setWhatIfName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Node ID</label>
                <input
                  value={whatIfNodeId}
                  onChange={(e) => setWhatIfNodeId(e.target.value)}
                  placeholder="paste node UUID"
                  style={{ ...inputStyle, width: 280 }}
                />
              </div>
              <div>
                <label style={labelStyle}>New Probability</label>
                <input
                  type="number"
                  value={whatIfProb}
                  onChange={(e) => setWhatIfProb(e.target.value)}
                  min="0"
                  max="1"
                  step="0.05"
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
              <button
                onClick={() =>
                  runAnalysis("whatif", {
                    scenario: {
                      name: whatIfName,
                      overrides: [
                        { node_id: whatIfNodeId, probability: parseFloat(whatIfProb) },
                      ],
                    },
                  })
                }
                disabled={isLoading || !whatIfNodeId}
                style={{ ...btnStyle, opacity: isLoading || !whatIfNodeId ? 0.5 : 1 }}
              >
                {isLoading ? "Running..." : "Run What-If"}
              </button>
            </div>
          )}

          {/* Results */}
          {!data && !isLoading && (
            <div style={{ color: "#525252", fontSize: 13 }}>
              No results yet. Run the analysis to see results.
            </div>
          )}

          {data && activeTab === "sensitivity" && (
            <SensitivityView data={data} onNodeFocus={onNodeFocus} />
          )}
          {data && activeTab === "convergence" && (
            <ConvergenceView data={data} onNodeFocus={onNodeFocus} />
          )}
          {data && activeTab === "whatif" && (
            <WhatIfView data={data} onNodeFocus={onNodeFocus} />
          )}
          {data && activeTab === "timeline" && (
            <TimelineView data={data} onNodeFocus={onNodeFocus} />
          )}
          {data && activeTab === "montecarlo" && (
            <MonteCarloView data={data} onNodeFocus={onNodeFocus} />
          )}
          {data && activeTab === "voi" && (
            <VOIView data={data} onNodeFocus={onNodeFocus} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-views ----

function SensitivityView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  const nodes = data.nodes || [];
  const maxImpact = nodes[0]?.impact_score || 1;

  return (
    <div>
      <SectionHeader>Linchpin Assumptions — ranked by downstream impact</SectionHeader>
      <table style={tableStyle}>
        <thead>
          <tr style={thRowStyle}>
            <th style={thStyle}>Question</th>
            <th style={{ ...thStyle, width: 60, textAlign: "right" }}>P</th>
            <th style={{ ...thStyle, width: 100, textAlign: "right" }}>Impact</th>
            <th style={{ ...thStyle, width: 70, textAlign: "right" }}>Affected</th>
            <th style={{ ...thStyle, width: 80, textAlign: "right" }}>Max Shift</th>
          </tr>
        </thead>
        <tbody>
          {nodes.slice(0, 25).map((n: any, i: number) => (
            <tr
              key={n.node_id}
              style={{ ...trStyle, cursor: "pointer" }}
              onClick={() => onNodeFocus?.(n.node_id)}
            >
              <td style={tdStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 4,
                      height: 24,
                      borderRadius: 2,
                      background: `rgba(239, 68, 68, ${n.impact_score / maxImpact})`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{n.question.length > 80 ? n.question.slice(0, 80) + "..." : n.question}</span>
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{(n.current_probability * 100).toFixed(0)}%</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#ef4444" }}>
                {n.impact_score.toFixed(3)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{n.affected_count}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>±{(n.max_downstream_shift * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConvergenceView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {data.convergences?.length > 0 && (
        <div>
          <SectionHeader>Convergence Points — multiple independent paths support these conclusions</SectionHeader>
          {data.convergences.slice(0, 10).map((c: any, i: number) => (
            <div
              key={i}
              style={{ ...cardStyle, cursor: "pointer" }}
              onClick={() => onNodeFocus?.(c.target_node_id)}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e5e5", marginBottom: 6 }}>
                {c.target_question.length > 100 ? c.target_question.slice(0, 100) + "..." : c.target_question}
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#a3a3a3" }}>
                <span><strong style={{ color: "#22c55e" }}>{c.independent_paths.length}</strong> independent paths</span>
                <span>Score: <strong style={{ color: "#3b82f6" }}>{c.convergence_score.toFixed(2)}</strong></span>
                <span>Weighted P: {(c.supporting_probability * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.divergences?.length > 0 && (
        <div>
          <SectionHeader>Divergences — contradictory conclusions from related evidence</SectionHeader>
          {data.divergences.slice(0, 10).map((d: any, i: number) => (
            <div key={i} style={{ ...cardStyle, borderLeftColor: "#ef4444" }}>
              <div style={{ fontSize: 12, color: "#d4d4d4", lineHeight: 1.6 }}>{d.description}</div>
              <div style={{ fontSize: 11, color: "#737373", marginTop: 4 }}>
                Tension score: {d.tension_score.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!data.convergences?.length && !data.divergences?.length && (
        <div style={{ color: "#525252", fontSize: 13 }}>No significant convergences or divergences detected.</div>
      )}
    </div>
  );
}

function WhatIfView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  if (data.error) return <div style={{ color: "#ef4444" }}>{data.error}</div>;

  const diffs = data.diffs || [];
  return (
    <div>
      <SectionHeader>
        Scenario: {data.scenario?.name} — Total impact: {data.total_impact?.toFixed(3)}
      </SectionHeader>
      {diffs.length === 0 ? (
        <div style={{ color: "#525252", fontSize: 13 }}>No downstream changes detected.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr style={thRowStyle}>
              <th style={thStyle}>Question</th>
              <th style={{ ...thStyle, width: 70, textAlign: "right" }}>Before</th>
              <th style={{ ...thStyle, width: 70, textAlign: "right" }}>After</th>
              <th style={{ ...thStyle, width: 80, textAlign: "right" }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d: any) => (
              <tr
                key={d.node_id}
                style={{ ...trStyle, cursor: "pointer" }}
                onClick={() => onNodeFocus?.(d.node_id)}
              >
                <td style={tdStyle}>
                  {d.question.length > 80 ? d.question.slice(0, 80) + "..." : d.question}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{(d.before * 100).toFixed(0)}%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{(d.after * 100).toFixed(0)}%</td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontWeight: 600,
                    color: d.delta > 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  {d.delta > 0 ? "+" : ""}{(d.delta * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TimelineView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  const phases = data.phases || [];
  const events = data.events || [];
  const eventMap = new Map<string, any>(events.map((e: any) => [e.node_id, e]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {phases.map((phase: any, i: number) => (
        <div key={i}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#e5e5e5",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6"][i] || "#737373",
                flexShrink: 0,
              }}
            />
            {phase.name}
          </div>
          {phase.summary && (
            <div style={{ fontSize: 13, color: "#a3a3a3", lineHeight: 1.6, marginBottom: 10, marginLeft: 16 }}>
              {phase.summary}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 16 }}>
            {phase.events.map((nodeId: string) => {
              const event = eventMap.get(nodeId);
              if (!event) return null;
              return (
                <div
                  key={nodeId}
                  style={{ ...cardStyle, cursor: "pointer", padding: "8px 12px" }}
                  onClick={() => onNodeFocus?.(nodeId)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 12, color: "#d4d4d4", flex: 1 }}>
                      {event.question.length > 90 ? event.question.slice(0, 90) + "..." : event.question}
                    </span>
                    <span style={{ fontSize: 11, color: "#737373", flexShrink: 0, marginLeft: 12 }}>
                      P={( event.probability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#525252", marginTop: 4 }}>
                    <span>onset: {event.temporal.onset_value} {event.temporal.onset}</span>
                    <span>peak: {event.temporal.peak_window}</span>
                    <span>duration: {event.temporal.duration}</span>
                    {event.themes?.map((t: string) => (
                      <span key={t} style={{ color: "#8b5cf6" }}>{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {data.token_usage && (
        <div style={{ fontSize: 10, color: "#525252" }}>
          Tokens: {data.token_usage.input.toLocaleString()} in / {data.token_usage.output.toLocaleString()} out
        </div>
      )}
    </div>
  );
}

function MonteCarloView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  const nodes = data.nodes || [];
  const correlations = data.correlations || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ fontSize: 12, color: "#737373" }}>
        {data.simulations?.toLocaleString()} simulations
      </div>

      <div>
        <SectionHeader>Probability Distributions</SectionHeader>
        <table style={tableStyle}>
          <thead>
            <tr style={thRowStyle}>
              <th style={thStyle}>Question</th>
              <th style={{ ...thStyle, width: 50, textAlign: "right" }}>Est.</th>
              <th style={{ ...thStyle, width: 50, textAlign: "right" }}>Mean</th>
              <th style={{ ...thStyle, width: 130, textAlign: "center" }}>90% Interval</th>
              <th style={{ ...thStyle, width: 50, textAlign: "right" }}>SD</th>
            </tr>
          </thead>
          <tbody>
            {nodes.slice(0, 30).map((n: any) => {
              const width = n.credible_interval_width;
              return (
                <tr
                  key={n.node_id}
                  style={{ ...trStyle, cursor: "pointer" }}
                  onClick={() => onNodeFocus?.(n.node_id)}
                >
                  <td style={tdStyle}>
                    {n.question.length > 70 ? n.question.slice(0, 70) + "..." : n.question}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{(n.point_estimate * 100).toFixed(0)}%</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{(n.mean * 100).toFixed(0)}%</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                      <span style={{ fontSize: 10, color: "#737373" }}>{(n.percentiles.p5 * 100).toFixed(0)}%</span>
                      <div
                        style={{
                          height: 6,
                          background: `linear-gradient(to right, #1e3a5f, #3b82f6, #1e3a5f)`,
                          borderRadius: 3,
                          width: `${Math.max(20, width * 100)}px`,
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#737373" }}>{(n.percentiles.p95 * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: width > 0.4 ? "#ef4444" : "#737373" }}>
                    {(n.std_dev * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {correlations.length > 0 && (
        <div>
          <SectionHeader>Strongest Correlations</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {correlations.slice(0, 10).map((c: any, i: number) => {
              const nodeA = nodes.find((n: any) => n.node_id === c.node_a);
              const nodeB = nodes.find((n: any) => n.node_id === c.node_b);
              return (
                <div key={i} style={{ ...cardStyle, padding: "6px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#d4d4d4", flex: 1 }}>
                      {nodeA?.question.slice(0, 45)}... ↔ {nodeB?.question.slice(0, 45)}...
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: c.correlation > 0 ? "#22c55e" : "#ef4444",
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
                    >
                      {c.correlation > 0 ? "+" : ""}{c.correlation.toFixed(3)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.widest_intervals?.length > 0 && (
        <div>
          <SectionHeader>Widest Uncertainty Intervals</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.widest_intervals.map((id: string) => {
              const node = nodes.find((n: any) => n.node_id === id);
              if (!node) return null;
              return (
                <div
                  key={id}
                  style={{ ...cardStyle, cursor: "pointer", padding: "6px 12px" }}
                  onClick={() => onNodeFocus?.(id)}
                >
                  <div style={{ fontSize: 12, color: "#d4d4d4" }}>
                    {node.question.slice(0, 80)}...
                  </div>
                  <div style={{ fontSize: 11, color: "#f59e0b" }}>
                    90% interval: {(node.percentiles.p5 * 100).toFixed(0)}% – {(node.percentiles.p95 * 100).toFixed(0)}%
                    (width: {(node.credible_interval_width * 100).toFixed(0)}pp)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function VOIView({ data, onNodeFocus }: { data: any; onNodeFocus?: (id: string) => void }) {
  const nodes = data.nodes || [];
  const maxVOI = nodes[0]?.voi_score || 1;

  return (
    <div>
      <SectionHeader>
        Value of Information — which questions would reduce the most uncertainty if answered
      </SectionHeader>
      <div style={{ fontSize: 12, color: "#737373", marginBottom: 16 }}>
        Current graph entropy: {data.current_graph_entropy?.toFixed(3) || "—"} bits
      </div>
      <table style={tableStyle}>
        <thead>
          <tr style={thRowStyle}>
            <th style={thStyle}>Question</th>
            <th style={{ ...thStyle, width: 80, textAlign: "right" }}>VOI Score</th>
            <th style={{ ...thStyle, width: 90, textAlign: "right" }}>If Low (0.1)</th>
            <th style={{ ...thStyle, width: 90, textAlign: "right" }}>If High (0.9)</th>
            <th style={{ ...thStyle, width: 90, textAlign: "right" }}>Expected</th>
          </tr>
        </thead>
        <tbody>
          {nodes.slice(0, 25).map((n: any) => (
            <tr
              key={n.node_id}
              style={{ ...trStyle, cursor: "pointer" }}
              onClick={() => onNodeFocus?.(n.node_id)}
            >
              <td style={tdStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 4,
                      height: 24,
                      borderRadius: 2,
                      background: `rgba(59, 130, 246, ${Math.min(n.voi_score / maxVOI, 1)})`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{n.question.length > 80 ? n.question.slice(0, 80) + "..." : n.question}</span>
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#3b82f6" }}>
                {n.voi_score.toFixed(3)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#ef4444" }}>
                -{n.entropy_reduction_low.toFixed(3)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#22c55e" }}>
                -{n.entropy_reduction_high.toFixed(3)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                -{n.expected_entropy_reduction.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Shared components ----

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

// ---- Styles ----

const btnStyle = {
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer" as const,
  fontWeight: 500,
  background: "#1e3a5f",
  border: "1px solid #3b82f6",
  color: "#93c5fd",
};

const labelStyle = {
  fontSize: 10,
  color: "#737373",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 4,
};

const inputStyle = {
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #333",
  background: "#1a1a1a",
  color: "#e5e5e5",
  fontSize: 12,
  outline: "none",
  width: 180,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 12,
};

const thRowStyle = {
  borderBottom: "1px solid #262626",
};

const thStyle = {
  textAlign: "left" as const,
  padding: "8px 8px",
  color: "#525252",
  fontWeight: 500,
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const trStyle = {
  borderBottom: "1px solid #1a1a1a",
};

const tdStyle = {
  padding: "8px 8px",
  color: "#d4d4d4",
};

const cardStyle = {
  background: "#0a0a0a",
  border: "1px solid #1a1a1a",
  borderLeft: "3px solid #3b82f6",
  borderRadius: 6,
  padding: "10px 14px",
  marginBottom: 6,
};

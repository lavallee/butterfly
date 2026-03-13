"use client";

import { useEffect, useState } from "react";
import type { CalibrationData } from "@/types";

interface Props {
  onClose: () => void;
  onNodeFocus?: (nodeId: string) => void;
}

export default function CalibrationPanel({ onClose, onNodeFocus }: Props) {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calibration")
      .then((r) => r.json())
      .then((d) => {
        if (d.bins) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const W = 400;
  const H = 400;
  const PAD = 50;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "#111111",
          border: "1px solid #262626",
          borderRadius: 12,
          padding: 24,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>Calibration</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#737373", cursor: "pointer", fontSize: 22 }}
          >
            ×
          </button>
        </div>

        {loading && <div style={{ color: "#525252", fontSize: 13 }}>Loading...</div>}

        {!loading && !data && (
          <div style={{ color: "#525252", fontSize: 13 }}>
            No resolved questions yet. Resolve completed questions to see calibration data.
          </div>
        )}

        {data && (
          <>
            {/* Stats */}
            <div style={{ display: "flex", gap: 24, marginBottom: 20, fontSize: 12 }}>
              <div>
                <span style={{ color: "#737373" }}>Resolved: </span>
                <span style={{ color: "#e5e5e5", fontWeight: 600 }}>{data.resolved_count}</span>
              </div>
              <div>
                <span style={{ color: "#737373" }}>Overall Brier: </span>
                <span style={{
                  fontWeight: 600,
                  color: data.overall_brier < 0.1 ? "#22c55e" : data.overall_brier < 0.25 ? "#f59e0b" : "#ef4444",
                }}>
                  {data.overall_brier.toFixed(3)}
                </span>
                <span style={{ color: "#525252", marginLeft: 4 }}>
                  ({data.overall_brier < 0.1 ? "excellent" : data.overall_brier < 0.25 ? "good" : "needs work"})
                </span>
              </div>
            </div>

            {/* Calibration Chart */}
            <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
              {/* Background */}
              <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="#0a0a0a" rx={4} />

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <g key={v}>
                  <line
                    x1={PAD}
                    x2={PAD + plotW}
                    y1={PAD + (1 - v) * plotH}
                    y2={PAD + (1 - v) * plotH}
                    stroke="#1a1a1a"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD - 8}
                    y={PAD + (1 - v) * plotH + 4}
                    textAnchor="end"
                    fill="#525252"
                    fontSize={10}
                  >
                    {(v * 100).toFixed(0)}%
                  </text>
                  <line
                    x1={PAD + v * plotW}
                    x2={PAD + v * plotW}
                    y1={PAD}
                    y2={PAD + plotH}
                    stroke="#1a1a1a"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD + v * plotW}
                    y={PAD + plotH + 16}
                    textAnchor="middle"
                    fill="#525252"
                    fontSize={10}
                  >
                    {(v * 100).toFixed(0)}%
                  </text>
                </g>
              ))}

              {/* Perfect calibration line */}
              <line
                x1={PAD}
                y1={PAD + plotH}
                x2={PAD + plotW}
                y2={PAD}
                stroke="#3b82f630"
                strokeWidth={2}
                strokeDasharray="4 4"
              />

              {/* Calibration points */}
              {data.bins
                .filter((b) => b.count > 0)
                .map((bin, i) => {
                  const x = PAD + bin.predicted_avg * plotW;
                  const y = PAD + (1 - bin.actual_rate) * plotH;
                  const r = Math.max(4, Math.min(12, bin.count * 2));
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill="#3b82f6"
                        fillOpacity={0.6}
                        stroke="#93c5fd"
                        strokeWidth={1}
                      >
                        <title>
                          Predicted: {(bin.predicted_avg * 100).toFixed(0)}% | Actual: {(bin.actual_rate * 100).toFixed(0)}% | N={bin.count}
                        </title>
                      </circle>
                      <text
                        x={x}
                        y={y - r - 4}
                        textAnchor="middle"
                        fill="#737373"
                        fontSize={9}
                      >
                        n={bin.count}
                      </text>
                    </g>
                  );
                })}

              {/* Axis labels */}
              <text
                x={PAD + plotW / 2}
                y={PAD + plotH + 36}
                textAnchor="middle"
                fill="#737373"
                fontSize={11}
              >
                Predicted Probability
              </text>
              <text
                x={14}
                y={PAD + plotH / 2}
                textAnchor="middle"
                fill="#737373"
                fontSize={11}
                transform={`rotate(-90, 14, ${PAD + plotH / 2})`}
              >
                Actual Frequency
              </text>
            </svg>

            {/* Bin detail table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #262626" }}>
                  <th style={thStyle}>Bin</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Predicted</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actual</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Count</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.bins
                  .filter((b) => b.count > 0)
                  .map((bin, i) => {
                    const error = Math.abs(bin.predicted_avg - bin.actual_rate);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
                        <td style={tdStyle}>
                          {(bin.bin_start * 100).toFixed(0)}–{(bin.bin_end * 100).toFixed(0)}%
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {(bin.predicted_avg * 100).toFixed(0)}%
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {(bin.actual_rate * 100).toFixed(0)}%
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{bin.count}</td>
                        <td style={{
                          ...tdStyle,
                          textAlign: "right",
                          color: error > 0.15 ? "#ef4444" : error > 0.05 ? "#f59e0b" : "#22c55e",
                        }}>
                          {(error * 100).toFixed(1)}pp
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "#525252",
  fontWeight: 500,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  color: "#d4d4d4",
};

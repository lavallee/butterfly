"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { QuestionNode as QNode } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  open: "#525252",
  researching: "#3b82f6",
  complete: "#22c55e",
  stale: "#eab308",
  resolved: "#ec4899",
};

function probabilityColor(p: number): string {
  if (p > 0.7) return "#22c55e";
  if (p > 0.4) return "#eab308";
  return "#ef4444";
}

function QuestionNodeComponent({ data }: NodeProps<QNode>) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = STATUS_COLORS[data.status] || "#525252";
  const pColor = probabilityColor(data.probability);

  return (
    <div
      className="group"
      style={{
        background: "#171717",
        border: `1px solid ${statusColor}`,
        borderRadius: 12,
        padding: "12px 16px",
        minWidth: 240,
        maxWidth: 360,
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow:
          data.status === "researching"
            ? `0 0 20px ${statusColor}40`
            : "none",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#404040", border: "none", width: 8, height: 8 }}
      />

      {/* Header: status + probability */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span style={{ color: statusColor, fontWeight: 600 }}>
          {data.status === "researching" ? "● researching" : data.status}
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ color: pColor }}>
            P: {(data.probability * 100).toFixed(0)}%
          </span>
          <span style={{ color: "#737373" }}>
            C: {(data.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Question */}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.4,
          color: "#e5e5e5",
          fontWeight: 500,
        }}
      >
        {data.question}
      </div>

      {/* Priority score */}
      {data.priority_score > 0 && data.status === "open" && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "#525252",
          }}
        >
          priority: {data.priority_score.toFixed(3)}
        </div>
      )}

      {/* Expanded: show summary */}
      {expanded && data.summary && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid #262626",
            fontSize: 12,
            lineHeight: 1.6,
            color: "#a3a3a3",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {data.summary.slice(0, 800)}
          {data.summary.length > 800 && "..."}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#404040", border: "none", width: 8, height: 8 }}
      />
    </div>
  );
}

export default memo(QuestionNodeComponent);

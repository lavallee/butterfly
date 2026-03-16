"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, useStore } from "reactflow";
import type { QuestionNode as QNode } from "@/types";

// Exported so Canvas and other components can share thresholds
export const ZOOM_TIER_DOT = 0.35;
export const ZOOM_TIER_COMPACT = 0.7;

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
  const zoom = useStore((s) => s.transform[2]);

  const statusColor = STATUS_COLORS[data.status] || "#525252";
  const pColor = probabilityColor(data.probability);
  const dimmed = (data as any)._dimmed;
  const collapsedCount = (data as any)._collapsedChildren as number | undefined;

  // ---- DOT tier ----
  if (zoom < ZOOM_TIER_DOT) {
    const size = 10 + data.probability * 12;
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: statusColor,
          opacity: dimmed ? 0.15 : 0.9,
          boxShadow: data.status === "researching" ? `0 0 8px ${statusColor}` : undefined,
          position: "relative",
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0, top: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: 0 }} />
        {collapsedCount != null && collapsedCount > 0 && (
          <div style={{
            position: "absolute", top: -6, right: -8,
            background: "#3b82f6", color: "#fff",
            fontSize: 7, fontWeight: 700,
            borderRadius: 6, padding: "0 3px",
            lineHeight: "12px",
          }}>
            +{collapsedCount}
          </div>
        )}
      </div>
    );
  }

  // ---- COMPACT tier ----
  if (zoom < ZOOM_TIER_COMPACT) {
    const label = data.question.length > 40 ? data.question.slice(0, 38) + "…" : data.question;
    return (
      <div
        style={{
          background: "#171717",
          borderLeft: `3px solid ${statusColor}`,
          borderRadius: 6,
          padding: "4px 10px",
          width: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          opacity: dimmed ? 0.15 : 1,
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <span style={{ fontSize: 10, color: "#d4d4d4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: pColor, fontWeight: 600, flexShrink: 0 }}>
          {(data.probability * 100).toFixed(0)}%
        </span>
        {collapsedCount != null && collapsedCount > 0 && (
          <span style={{
            background: "#3b82f6", color: "#fff",
            fontSize: 8, fontWeight: 700,
            borderRadius: 6, padding: "0 4px",
            lineHeight: "14px", flexShrink: 0,
          }}>
            +{collapsedCount}
          </span>
        )}
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  // ---- FULL tier ----
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
        opacity: dimmed ? 0.15 : 1,
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

      {/* Collapsed children badge */}
      {collapsedCount != null && collapsedCount > 0 && (
        <div style={{
          marginTop: 8,
          fontSize: 10,
          color: "#93c5fd",
          background: "#1e3a5f",
          border: "1px solid #3b82f630",
          borderRadius: 4,
          padding: "2px 8px",
          display: "inline-block",
        }}>
          +{collapsedCount} collapsed
        </div>
      )}

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

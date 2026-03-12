"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { Annotation } from "@/types";

const TYPE_STYLES = {
  question: { border: "#8b5cf6", icon: "?" },
  nudge: { border: "#f59e0b", icon: "→" },
  insight: { border: "#06b6d4", icon: "✦" },
};

function AnnotationNodeComponent({ data }: NodeProps<Annotation>) {
  const style = TYPE_STYLES[data.type] || TYPE_STYLES.insight;

  return (
    <div
      style={{
        background: "#1a1a2e",
        border: `1px dashed ${style.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        maxWidth: 240,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0 }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span
          style={{
            color: style.border,
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {style.icon}
        </span>
        <span style={{ color: "#d4d4d4" }}>{data.content}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0 }}
      />
    </div>
  );
}

export default memo(AnnotationNodeComponent);

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityEvent } from "@/types";

const EVENT_COLORS: Record<string, string> = {
  engine_started: "#22c55e",
  engine_stopped: "#ef4444",
  research_started: "#3b82f6",
  research_completed: "#22c55e",
  critique_applied: "#f59e0b",
  question_created: "#8b5cf6",
  question_skipped_duplicate: "#737373",
  probability_propagated: "#06b6d4",
  budget_warning: "#f59e0b",
  budget_exhausted: "#ef4444",
};

const EVENT_ICONS: Record<string, string> = {
  engine_started: ">>",
  engine_stopped: "||",
  research_started: "->",
  research_completed: "OK",
  critique_applied: "!!",
  question_created: "++",
  question_skipped_duplicate: "~~",
  probability_propagated: "<>",
  budget_warning: "$$",
  budget_exhausted: "XX",
};

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onNodeFocus?: (nodeId: string) => void;
}

export default function ActivityLog({ isOpen, onToggle, onNodeFocus }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?limit=50");
      const data = await res.json();
      setEvents(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchEvents();
      const interval = setInterval(fetchEvents, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchEvents]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 40,
          padding: "6px 14px",
          borderRadius: 6,
          fontSize: 12,
          cursor: "pointer",
          fontWeight: 500,
          background: "#1a1a1a",
          color: "#d4d4d4",
          border: "1px solid #333",
        }}
      >
        Activity Log
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: 420,
        maxHeight: "50vh",
        background: "#111111",
        borderRight: "1px solid #262626",
        borderTop: "1px solid #262626",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        borderTopRightRadius: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid #262626",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#737373",
          }}
        >
          Activity Log
        </span>
        <button
          onClick={onToggle}
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

      {/* Events */}
      <div
        style={{
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {events.length === 0 && (
          <div style={{ color: "#525252", fontSize: 12, padding: 8 }}>
            No activity yet.
          </div>
        )}
        {events.map((evt) => (
          <div
            key={evt.id}
            onClick={() => evt.node_id && onNodeFocus?.(evt.node_id)}
            style={{
              display: "flex",
              gap: 8,
              padding: "4px 6px",
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.5,
              alignItems: "flex-start",
              cursor: evt.node_id ? "pointer" : "default",
            }}
            onMouseEnter={(e) => {
              if (evt.node_id) e.currentTarget.style.background = "#1a1a1a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                color: EVENT_COLORS[evt.type] || "#737373",
                fontFamily: "monospace",
                fontSize: 10,
                flexShrink: 0,
                width: 20,
                textAlign: "center",
              }}
            >
              {EVENT_ICONS[evt.type] || ".."}
            </span>
            <span style={{ color: "#a3a3a3", flexShrink: 0, fontSize: 10 }}>
              {new Date(evt.timestamp).toLocaleTimeString()}
            </span>
            <span style={{ color: "#d4d4d4" }}>
              {evt.detail.length > 150
                ? evt.detail.slice(0, 150) + "..."
                : evt.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

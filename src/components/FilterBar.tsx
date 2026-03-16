"use client";

import { useState, useCallback, useMemo } from "react";
import type { QuestionNode } from "@/types";

export interface FilterState {
  statuses: Set<string>;
  depthRange: [number, number];
  probRange: [number, number];
  search: string;
}

interface Props {
  maxDepth: number;
  onChange: (predicate: ((node: QuestionNode) => boolean) | null) => void;
}

const ALL_STATUSES = ["open", "researching", "complete", "stale", "resolved"];

export default function FilterBar({ maxDepth, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [depthMin, setDepthMin] = useState(0);
  const [depthMax, setDepthMax] = useState(maxDepth);
  const [probMin, setProbMin] = useState(0);
  const [probMax, setProbMax] = useState(100);
  const [search, setSearch] = useState("");

  const isDefault =
    statuses.size === ALL_STATUSES.length &&
    depthMin === 0 &&
    depthMax >= maxDepth &&
    probMin === 0 &&
    probMax === 100 &&
    search === "";

  const emitFilter = useCallback(
    (s: Set<string>, dMin: number, dMax: number, pMin: number, pMax: number, q: string) => {
      const allStatuses = s.size === ALL_STATUSES.length;
      const fullDepth = dMin === 0 && dMax >= maxDepth;
      const fullProb = pMin === 0 && pMax === 100;
      const noSearch = q === "";

      if (allStatuses && fullDepth && fullProb && noSearch) {
        onChange(null);
        return;
      }

      const searchLower = q.toLowerCase();
      onChange((node: QuestionNode) => {
        if (!s.has(node.status)) return false;
        if (node.depth < dMin || node.depth > dMax) return false;
        const pPct = node.probability * 100;
        if (pPct < pMin || pPct > pMax) return false;
        if (searchLower && !node.question.toLowerCase().includes(searchLower)) return false;
        return true;
      });
    },
    [maxDepth, onChange]
  );

  const toggleStatus = (status: string) => {
    const next = new Set(statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setStatuses(next);
    emitFilter(next, depthMin, depthMax, probMin, probMax, search);
  };

  const clearFilters = () => {
    const all = new Set(ALL_STATUSES);
    setStatuses(all);
    setDepthMin(0);
    setDepthMax(maxDepth);
    setProbMin(0);
    setProbMax(100);
    setSearch("");
    onChange(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          ...chipBase,
          background: isDefault ? "#1a1a1a" : "#1e3a5f",
          borderColor: isDefault ? "#333" : "#3b82f6",
          color: isDefault ? "#737373" : "#93c5fd",
        }}
        title="Filter nodes"
      >
        ▽ Filter{!isDefault && " (active)"}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 52,
        left: 16,
        zIndex: 39,
        background: "#141414",
        border: "1px solid #262626",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 11,
        minWidth: 320,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#737373", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>
          Filters
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {!isDefault && (
            <button onClick={clearFilters} style={{ ...chipBase, padding: "2px 8px", fontSize: 10, color: "#f59e0b", borderColor: "#f59e0b40", background: "#1a1a0f" }}>
              Clear
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#525252", cursor: "pointer", fontSize: 14 }}>
            ×
          </button>
        </div>
      </div>

      {/* Status chips */}
      <div>
        <label style={labelStyle}>Status</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ALL_STATUSES.map((s) => {
            const active = statuses.has(s);
            const sColor = STATUS_CHIP_COLORS[s] || "#525252";
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                style={{
                  ...chipBase,
                  padding: "2px 10px",
                  fontSize: 10,
                  textTransform: "capitalize",
                  background: active ? sColor + "20" : "transparent",
                  borderColor: active ? sColor + "60" : "#333",
                  color: active ? sColor : "#525252",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Depth range */}
      <div>
        <label style={labelStyle}>Depth: {depthMin}–{depthMax}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={0}
            max={maxDepth}
            value={depthMin}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setDepthMin(v);
              emitFilter(statuses, v, depthMax, probMin, probMax, search);
            }}
            style={sliderStyle}
          />
          <input
            type="range"
            min={0}
            max={maxDepth}
            value={depthMax}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setDepthMax(v);
              emitFilter(statuses, depthMin, v, probMin, probMax, search);
            }}
            style={sliderStyle}
          />
        </div>
      </div>

      {/* Probability range */}
      <div>
        <label style={labelStyle}>Probability: {probMin}%–{probMax}%</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={0}
            max={100}
            value={probMin}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setProbMin(v);
              emitFilter(statuses, depthMin, depthMax, v, probMax, search);
            }}
            style={sliderStyle}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={probMax}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setProbMax(v);
              emitFilter(statuses, depthMin, depthMax, probMin, v, search);
            }}
            style={sliderStyle}
          />
        </div>
      </div>

      {/* Search */}
      <div>
        <label style={labelStyle}>Search</label>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            emitFilter(statuses, depthMin, depthMax, probMin, probMax, e.target.value);
          }}
          placeholder="Filter by question text…"
          style={{
            width: "100%",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid #333",
            background: "#1a1a1a",
            color: "#e5e5e5",
            fontSize: 11,
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

const STATUS_CHIP_COLORS: Record<string, string> = {
  open: "#525252",
  researching: "#3b82f6",
  complete: "#22c55e",
  stale: "#eab308",
  resolved: "#ec4899",
};

const chipBase: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 500,
  border: "1px solid #333",
  background: "#1a1a1a",
  color: "#d4d4d4",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#525252",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 4,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "#3b82f6",
  height: 4,
};

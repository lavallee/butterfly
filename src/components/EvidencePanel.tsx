"use client";

import { useState } from "react";
import type { QuestionNode } from "@/types";

interface Props {
  node: QuestionNode | null;
  onClose: () => void;
  onAnnotate: (nodeId: string, content: string, type: string) => void;
}

export default function EvidencePanel({ node, onClose, onAnnotate }: Props) {
  const [annotationText, setAnnotationText] = useState("");
  const [annotationType, setAnnotationType] = useState<string>("question");

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

      {/* Evidence */}
      {node.evidence.length > 0 && (
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
            Evidence ({node.evidence.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {node.evidence.map((e, i) => (
              <div
                key={i}
                style={{
                  background: "#1a1a1a",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: "#d4d4d4" }}>{e.content}</div>
                {e.source && (
                  <div style={{ color: "#525252", marginTop: 4, fontSize: 11 }}>
                    — {e.source}
                  </div>
                )}
              </div>
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

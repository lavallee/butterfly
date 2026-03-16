"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  ReactFlowProvider,
  type Node,
  type Edge as FlowEdge,
  BackgroundVariant,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";

import QuestionNodeComponent, { ZOOM_TIER_DOT, ZOOM_TIER_COMPACT } from "./QuestionNode";
import AnnotationNodeComponent from "./AnnotationNode";
import EvidencePanel from "./EvidencePanel";
import ActivityLog from "./ActivityLog";
import BriefingPanel from "./BriefingPanel";
import AnalysisPanel from "./AnalysisPanel";
import CalibrationPanel from "./CalibrationPanel";
import FilterBar from "./FilterBar";
import type {
  GraphState,
  QuestionNode,
  Edge as GraphEdge,
  EngineStatus,
  SynthesisResult,
} from "@/types";

const nodeTypes = {
  question: QuestionNodeComponent,
  annotation: AnnotationNodeComponent,
};

const EDGE_COLORS: Record<string, string> = {
  causes: "#ef4444",
  enables: "#22c55e",
  prevents: "#8b5cf6",
  amplifies: "#f59e0b",
  weakens: "#6b7280",
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 140;

function layoutWithDagre(
  flowNodes: Node[],
  flowEdges: FlowEdge[]
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  for (const node of flowNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of flowEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return flowNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

/**
 * Collect all transitive descendants of a node via edges.
 */
function getDescendants(nodeId: string, edges: GraphEdge[]): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of edges) {
      if (edge.source_id === current && !visited.has(edge.target_id)) {
        visited.add(edge.target_id);
        queue.push(edge.target_id);
      }
    }
  }
  return visited;
}

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<QuestionNode | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [autoLayout, setAutoLayout] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [filterPredicate, setFilterPredicate] = useState<((node: QuestionNode) => boolean) | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const prevNodeCountRef = useRef(0);
  const stopRef = useRef(false);
  const graphRef = useRef<GraphState | null>(null);
  const { fitView, setCenter } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  // Rebuild flow nodes/edges when zoom, selection, collapse, or filter changes
  useEffect(() => {
    if (graphRef.current) {
      buildFlowGraph(graphRef.current, false);
    }
  }, [zoom, selectedNode?.id, collapsedNodeIds, filterPredicate]);

  // Fetch graph state
  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/graph");
      const graph: GraphState = await res.json();
      graphRef.current = graph;
      buildFlowGraph(graph, true);
    } catch (err) {
      console.error("Failed to fetch graph:", err);
    }
  }, [autoLayout]);

  // Fetch engine status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/research");
      const status: EngineStatus = await res.json();
      setEngineStatus(status);
    } catch {}
  }, []);

  // Convert graph state to React Flow nodes/edges
  const buildFlowGraph = useCallback(
    (graph: GraphState, isNewData: boolean) => {
      // Compute which nodes are hidden by collapse
      const hiddenByCollapse = new Set<string>();
      for (const collapsedId of collapsedNodeIds) {
        const descendants = getDescendants(collapsedId, graph.edges);
        for (const d of descendants) {
          // Don't hide if this descendant is itself a collapsed node
          // (it should show as a collapsed node)
          if (!collapsedNodeIds.has(d)) {
            hiddenByCollapse.add(d);
          }
        }
      }

      // Count collapsed children for badge display
      const collapsedChildCounts = new Map<string, number>();
      for (const collapsedId of collapsedNodeIds) {
        const descendants = getDescendants(collapsedId, graph.edges);
        collapsedChildCounts.set(collapsedId, descendants.size);
      }

      // Visible node IDs (not hidden by collapse)
      const visibleNodeIds = new Set(
        graph.nodes.filter((n) => !hiddenByCollapse.has(n.id)).map((n) => n.id)
      );

      let flowNodes: Node[] = [
        ...graph.nodes
          .filter((n) => visibleNodeIds.has(n.id))
          .map((n) => {
            const dimmed = filterPredicate ? !filterPredicate(n) : false;
            return {
              id: n.id,
              type: "question" as const,
              position: n.position,
              data: {
                ...n,
                _dimmed: dimmed,
                _collapsedChildren: collapsedChildCounts.get(n.id) || 0,
              },
              draggable: true,
            };
          }),
        ...graph.annotations
          .filter(() => zoom > 0.4) // hide annotations at low zoom
          .map((a) => ({
            id: a.id,
            type: "annotation" as const,
            position: a.position,
            data: a,
            draggable: true,
          })),
      ];

      // Build edges — only between visible nodes
      const selectedId = selectedNode?.id || null;
      const selectedEdgeIds = new Set<string>();

      // Collect edges connected to selected node
      if (selectedId) {
        for (const e of graph.edges) {
          if (e.source_id === selectedId || e.target_id === selectedId) {
            selectedEdgeIds.add(e.id);
          }
        }
      }

      const flowEdges: FlowEdge[] = graph.edges
        .filter((e) => visibleNodeIds.has(e.source_id) && visibleNodeIds.has(e.target_id))
        .map((e) => {
          const baseColor = EDGE_COLORS[e.relationship] || "#404040";
          const isSelectedEdge = selectedEdgeIds.has(e.id);
          const hasSelection = selectedId !== null;

          // Edge declutter based on zoom and selection
          let opacity = 1;
          let strokeWidth = Math.max(1, e.strength * 3);
          let showLabel = true;
          let animated = e.relationship === "causes";

          if (zoom < ZOOM_TIER_DOT) {
            opacity = hasSelection ? (isSelectedEdge ? 0.8 : 0.08) : 0.25;
            strokeWidth = 1;
            showLabel = false;
            animated = false;
          } else if (zoom < ZOOM_TIER_COMPACT) {
            opacity = hasSelection ? (isSelectedEdge ? 0.9 : 0.12) : 0.5;
            showLabel = false;
            animated = false;
          } else if (hasSelection) {
            opacity = isSelectedEdge ? 1 : 0.15;
          }

          // Dim edges connected to filtered-out nodes
          if (filterPredicate) {
            const sourceNode = graph.nodes.find((n) => n.id === e.source_id);
            const targetNode = graph.nodes.find((n) => n.id === e.target_id);
            if (sourceNode && !filterPredicate(sourceNode) || targetNode && !filterPredicate(targetNode)) {
              opacity = Math.min(opacity, 0.1);
            }
          }

          return {
            id: e.id,
            source: e.source_id,
            target: e.target_id,
            animated,
            style: {
              stroke: baseColor,
              strokeWidth,
              opacity,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: baseColor,
              width: 16,
              height: 16,
            },
            label: showLabel ? e.relationship : undefined,
            labelStyle: showLabel ? { fontSize: 10, fill: "#525252" } : undefined,
            labelBgStyle: showLabel ? { fill: "#0a0a0a", fillOpacity: 0.8 } : undefined,
          };
        });

      // Auto-layout with dagre
      if (autoLayout && flowNodes.length > 0) {
        flowNodes = layoutWithDagre(flowNodes, flowEdges);
      }

      const nodeCountChanged = flowNodes.length !== prevNodeCountRef.current;
      prevNodeCountRef.current = flowNodes.length;

      setNodes(flowNodes);
      setEdges(flowEdges);

      // Fit view when new data arrives and node count changed
      if (isNewData && nodeCountChanged) {
        setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
      }
    },
    [setNodes, setEdges, autoLayout, fitView, zoom, selectedNode?.id, collapsedNodeIds, filterPredicate]
  );

  // Initial load
  useEffect(() => {
    fetchGraph();
    fetchStatus();
  }, [fetchGraph, fetchStatus]);

  // Poll while engine is running
  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(() => {
        fetchGraph();
        fetchStatus();
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning, fetchGraph, fetchStatus]);

  // Seed scenario
  const handleSeed = async () => {
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    await fetchGraph();
  };

  // Run one research cycle
  const handleRunOne = async () => {
    setIsRunning(true);
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await fetchGraph();
    await fetchStatus();
    setIsRunning(false);
  };

  // Run continuous
  const handleRunContinuous = async () => {
    stopRef.current = false;
    setIsRunning(true);
    setIsStopping(false);
    for (let i = 0; i < 20; i++) {
      if (stopRef.current) break;
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      await fetchGraph();
      await fetchStatus();
      if (!result.researched || stopRef.current) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    setIsRunning(false);
    setIsStopping(false);
  };

  const handleStop = async () => {
    stopRef.current = true;
    setIsStopping(true);
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  };

  // Node click → open evidence panel
  const handleNodeClick = useCallback((_: any, node: Node) => {
    if (node.type === "question") {
      setSelectedNode(node.data as QuestionNode);
    }
  }, []);

  // Double-click → toggle collapse
  const handleNodeDoubleClick = useCallback((_: any, node: Node) => {
    if (node.type !== "question") return;
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, []);

  // Focus a node from activity log
  const handleNodeFocus = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      // Select the node for the evidence panel
      if (node.type === "question") {
        setSelectedNode(node.data as QuestionNode);
      }

      // Zoom to the node
      const x = node.position.x + NODE_WIDTH / 2;
      const y = node.position.y + NODE_HEIGHT / 2;
      setCenter(x, y, { zoom: 1.2, duration: 500 });
    },
    [nodes, setCenter]
  );

  // Save position changes back to server
  const handleNodeDragStop = useCallback(async (_: any, node: Node) => {
    if (node.type === "question") {
      await fetch("/api/graph", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: node.id,
          updates: { position: node.position },
        }),
      });
    }
  }, []);

  // Add annotation
  const handleAnnotate = async (
    nodeId: string,
    content: string,
    type: string
  ) => {
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: nodeId, content, type }),
    });
    await fetchGraph();
  };

  // Synthesis
  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result: SynthesisResult = await res.json();
      setSynthesisResult(result);
      setBriefingOpen(true);
    } catch (err) {
      console.error("Synthesis failed:", err);
    }
    setIsSynthesizing(false);
  };

  const handleApplyEdges = async () => {
    const res = await fetch("/api/synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_edges" }),
    });
    const data = await res.json();
    await fetchGraph();
    setSynthesisResult((prev) =>
      prev ? { ...prev, proposed_edges: [], _edgesApplied: data.applied } as any : prev
    );
  };

  const handleApplyAdjustments = async () => {
    const res = await fetch("/api/synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_adjustments" }),
    });
    const data = await res.json();
    await fetchGraph();
    setSynthesisResult((prev) =>
      prev ? { ...prev, _adjustmentsApplied: data.adjusted } as any : prev
    );
  };

  // Resolve a question
  const handleResolve = async (nodeId: string, resolvedAs: "yes" | "no" | "partial") => {
    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, resolved_as: resolvedAs }),
      });
      const updated = await res.json();
      if (!updated.error) {
        setSelectedNode(updated);
        await fetchGraph();
      }
    } catch (err) {
      console.error("Resolution failed:", err);
    }
  };

  // Compute stats from question nodes
  const questionNodes = nodes.filter((n) => n.type === "question");
  const stats = {
    total: questionNodes.length,
    complete: questionNodes.filter((n) => (n.data as QuestionNode).status === "complete").length,
    researching: questionNodes.filter((n) => (n.data as QuestionNode).status === "researching").length,
    open: questionNodes.filter((n) => (n.data as QuestionNode).status === "open").length,
    stale: questionNodes.filter((n) => (n.data as QuestionNode).status === "stale").length,
    avgProbability: questionNodes.length > 0
      ? questionNodes.reduce((sum, n) => sum + (n.data as QuestionNode).probability, 0) / questionNodes.length
      : 0,
    avgConfidence: questionNodes.length > 0
      ? questionNodes.reduce((sum, n) => sum + (n.data as QuestionNode).confidence, 0) / questionNodes.length
      : 0,
    maxDepth: questionNodes.length > 0
      ? Math.max(...questionNodes.map((n) => (n.data as QuestionNode).depth))
      : 0,
  };

  // Max depth from full graph (for filter bar, not just visible nodes)
  const fullMaxDepth = graphRef.current
    ? Math.max(...graphRef.current.nodes.map((n) => n.depth), 0)
    : stats.maxDepth;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* Control bar */}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 40,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#e5e5e5",
            marginRight: 8,
          }}
        >
          butterfly
        </span>
        <button onClick={handleSeed} style={btnStyle}>
          Seed Scenario
        </button>
        <button onClick={handleRunOne} disabled={isRunning} style={btnStyle}>
          Research One
        </button>
        <button
          onClick={handleRunContinuous}
          disabled={isRunning}
          style={isRunning ? { ...btnAccentStyle, opacity: 0.5, cursor: "not-allowed" } : btnAccentStyle}
        >
          Run Continuous
        </button>
        {isRunning && (
          <button
            onClick={handleStop}
            disabled={isStopping}
            style={isStopping ? { ...btnWarnStyle, opacity: 0.5, cursor: "not-allowed" } : btnWarnStyle}
          >
            {isStopping ? "Stopping..." : "Stop After Current"}
          </button>
        )}
        <button
          onClick={() => setAutoLayout((v) => !v)}
          style={autoLayout ? btnAccentStyle : btnStyle}
        >
          Auto Layout
        </button>
        <FilterBar
          maxDepth={fullMaxDepth}
          onChange={setFilterPredicate}
        />
        {collapsedNodeIds.size > 0 && (
          <button
            onClick={() => setCollapsedNodeIds(new Set())}
            style={btnWarnStyle}
          >
            Expand All ({collapsedNodeIds.size})
          </button>
        )}
        <div style={{ width: 1, height: 20, background: "#333", margin: "0 4px" }} />
        <button
          onClick={handleSynthesize}
          disabled={isSynthesizing}
          style={isSynthesizing ? { ...btnStyle, opacity: 0.5, cursor: "not-allowed" } : btnStyle}
        >
          {isSynthesizing ? "Synthesizing..." : "Synthesize"}
        </button>
        {synthesisResult?.status === "complete" && !briefingOpen && (
          <button onClick={() => setBriefingOpen(true)} style={btnAccentStyle}>
            View Briefing
          </button>
        )}
        <button onClick={() => setAnalysisOpen(true)} style={btnStyle}>
          Analysis
        </button>
        <button onClick={() => setCalibrationOpen(true)} style={btnStyle}>
          Calibration
        </button>
        {/* Status indicator */}
        {isRunning && (
          <span style={{ fontSize: 11, marginLeft: 4, display: "flex", alignItems: "center", gap: 6 }}>
            {isStopping ? (
              <span style={{ color: "#f59e0b" }}>finishing current cycle...</span>
            ) : (
              <>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  animation: "pulse 1.5s infinite",
                }} />
                <span style={{ color: "#22c55e" }}>running</span>
              </>
            )}
          </span>
        )}
        {engineStatus && (
          <span style={{ fontSize: 11, color: "#525252", marginLeft: 4 }}>
            {engineStatus.cycles_completed} cycles
          </span>
        )}
      </div>

      {/* Stats panel */}
      {stats.total > 0 && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 40,
            background: "#141414",
            border: "1px solid #262626",
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            gap: 20,
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>
              Questions
            </span>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ color: "#22c55e" }}>{stats.complete} <span style={{ color: "#525252" }}>done</span></span>
              <span style={{ color: "#3b82f6" }}>{stats.researching} <span style={{ color: "#525252" }}>active</span></span>
              <span style={{ color: "#737373" }}>{stats.open} <span style={{ color: "#525252" }}>open</span></span>
              {stats.stale > 0 && (
                <span style={{ color: "#eab308" }}>{stats.stale} <span style={{ color: "#525252" }}>stale</span></span>
              )}
            </div>
          </div>
          <div style={{ width: 1, background: "#262626" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>
              Averages
            </span>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#d4d4d4" }}>P: {(stats.avgProbability * 100).toFixed(0)}%</span>
              <span style={{ color: "#d4d4d4" }}>C: {(stats.avgConfidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div style={{ width: 1, background: "#262626" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>
              Graph
            </span>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#d4d4d4" }}>{stats.total} nodes</span>
              <span style={{ color: "#d4d4d4" }}>depth {stats.maxDepth}</span>
              {engineStatus && <span style={{ color: "#d4d4d4" }}>{engineStatus.cycles_completed} cycles</span>}
            </div>
          </div>
          {engineStatus?.budget && (
            <>
              <div style={{ width: 1, background: "#262626" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>
                  Budget
                </span>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ color: "#d4d4d4" }}>${engineStatus.budget.estimated_cost_usd.toFixed(4)}</span>
                  {engineStatus.budget.budget_cap_usd && (
                    <span style={{ color: "#737373" }}>/ ${engineStatus.budget.budget_cap_usd.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1a1a1a"
        />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "annotation") return "#8b5cf6";
            const data = n.data as QuestionNode;
            if (data.status === "complete") return "#22c55e";
            if (data.status === "researching") return "#3b82f6";
            if (data.status === "resolved") return "#ec4899";
            return "#525252";
          }}
          maskColor="#0a0a0a80"
        />
      </ReactFlow>

      <EvidencePanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onAnnotate={handleAnnotate}
        onResolve={handleResolve}
        onNodeFocus={handleNodeFocus}
      />

      <ActivityLog
        isOpen={activityOpen}
        onToggle={() => setActivityOpen((v) => !v)}
        onNodeFocus={handleNodeFocus}
      />

      {analysisOpen && (
        <AnalysisPanel
          onClose={() => setAnalysisOpen(false)}
          onNodeFocus={(nodeId) => {
            setAnalysisOpen(false);
            handleNodeFocus(nodeId);
          }}
        />
      )}

      {calibrationOpen && (
        <CalibrationPanel
          onClose={() => setCalibrationOpen(false)}
          onNodeFocus={(nodeId) => {
            setCalibrationOpen(false);
            handleNodeFocus(nodeId);
          }}
        />
      )}

      {briefingOpen && synthesisResult && (
        <BriefingPanel
          result={synthesisResult}
          onClose={() => setBriefingOpen(false)}
          onApplyEdges={handleApplyEdges}
          onApplyAdjustments={handleApplyAdjustments}
          onNodeFocus={(nodeId) => {
            setBriefingOpen(false);
            handleNodeFocus(nodeId);
          }}
        />
      )}
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

const btnBase = {
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 500 as const,
  border: "1px solid #333",
};

const btnStyle = {
  ...btnBase,
  background: "#1a1a1a",
  color: "#d4d4d4",
};

const btnAccentStyle = {
  ...btnBase,
  background: "#1e3a5f",
  borderColor: "#3b82f6",
  color: "#93c5fd",
};

const btnDangerStyle = {
  ...btnBase,
  background: "#3b1111",
  borderColor: "#ef4444",
  color: "#fca5a5",
};

const btnWarnStyle = {
  ...btnBase,
  background: "#2d1f05",
  borderColor: "#f59e0b",
  color: "#fcd34d",
};

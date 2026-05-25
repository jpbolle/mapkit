"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";
import type { MindNode, NodePalette } from "@/lib/types";
import { layoutMindMap, type LayoutNode } from "@/lib/layout";

interface Props {
  nodes: MindNode[];
  onChange?: (nodes: MindNode[]) => void;
  readOnly?: boolean;
}

interface PaletteStyle {
  bg: string;
  border: string;
  text: string;
  ring: string;
}

const PAPER = "#fbf9f3";

/**
 * Returns a button style that visually marks the depth of a node so the
 * hierarchy is legible at a glance:
 *  - depth 0 (root): heavy filled dark serif card
 *  - depth 1 (branches): full-saturation pill with thick border
 *  - depth 2: half-tone pill with thinner colored border
 *  - depth 3+: very pale wash, dotted accent border, smaller text
 */
function depthStyle(
  depth: number,
  style: PaletteStyle,
  isSelected: boolean,
  readOnly: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    cursor: readOnly ? "pointer" : "grab",
    color: style.text,
    fontFamily: depth === 0 ? "var(--font-display)" : "var(--font-sans)",
    lineHeight: 1.25,
    transition: "box-shadow 120ms ease, transform 120ms ease",
  };

  const selection = isSelected
    ? `0 0 0 4px ${style.ring}, 0 8px 22px -12px rgba(0,0,0,0.28)`
    : undefined;

  if (depth === 0) {
    return {
      ...base,
      background: "#1a1d24",
      color: "#faf6ef",
      border: "1.5px solid #1a1d24",
      borderRadius: 18,
      padding: "16px 24px",
      fontSize: 19,
      fontWeight: 600,
      letterSpacing: "-0.005em",
      boxShadow:
        selection ??
        "0 1px 2px rgba(0,0,0,0.08), 0 18px 32px -18px rgba(0,0,0,0.45)",
    };
  }
  if (depth === 1) {
    return {
      ...base,
      background: style.bg,
      border: `2px solid ${style.border}`,
      borderRadius: 14,
      padding: "11px 18px",
      fontSize: 15.5,
      fontWeight: 600,
      boxShadow:
        selection ??
        "0 1px 2px rgba(0,0,0,0.05), 0 6px 18px -12px rgba(0,0,0,0.2)",
    };
  }
  if (depth === 2) {
    return {
      ...base,
      background: `color-mix(in srgb, ${style.bg} 55%, ${PAPER})`,
      border: `1.5px solid ${style.border}`,
      borderRadius: 11,
      padding: "8px 14px",
      fontSize: 13.5,
      fontWeight: 500,
      boxShadow:
        selection ??
        "0 1px 2px rgba(0,0,0,0.04), 0 3px 10px -8px rgba(0,0,0,0.18)",
    };
  }
  return {
    ...base,
    background: `color-mix(in srgb, ${style.bg} 25%, ${PAPER})`,
    border: `1px dashed ${style.border}`,
    borderRadius: 9,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 500,
    color: `color-mix(in srgb, ${style.text} 80%, ${PAPER})`,
    boxShadow:
      selection ?? "0 1px 2px rgba(0,0,0,0.03)",
  };
}

/**
 * Compute the position of a small affordance button (chevron, +) so that it
 * sits on the outer edge of the node, in the direction of its branch's side.
 * `outset` is the additional distance beyond the basic edge offset.
 */
function sideButtonPosition(side: string, outset: number): React.CSSProperties {
  const base = 14 + outset;
  switch (side) {
    case "left":
      return {
        top: "50%",
        left: -base,
        transform: "translateY(-50%)",
      };
    case "top":
      return {
        left: "50%",
        top: -base,
        transform: "translateX(-50%)",
      };
    case "bottom":
      return {
        left: "50%",
        bottom: -base,
        transform: "translateX(-50%)",
      };
    case "right":
    default:
      return {
        top: "50%",
        right: -base,
        transform: "translateY(-50%)",
      };
  }
}

function chevronGlyph(side: string): string {
  switch (side) {
    case "left":
      return "‹";
    case "top":
      return "˄";
    case "bottom":
      return "˅";
    case "right":
    default:
      return "›";
  }
}

const PALETTE_STYLE: Record<NodePalette, PaletteStyle> = {
  ink: {
    bg: "#1a1d24",
    border: "#1a1d24",
    text: "#faf6ef",
    ring: "rgba(26,29,36,0.2)",
  },
  brand: {
    bg: "#d8ece9",
    border: "#0e7c7b",
    text: "#0a4d4c",
    ring: "rgba(14,124,123,0.25)",
  },
  accent: {
    bg: "#fbe4d6",
    border: "#d97757",
    text: "#7a3920",
    ring: "rgba(217,119,87,0.25)",
  },
  leaf: {
    bg: "#e2eed9",
    border: "#6b9e57",
    text: "#3d5d2f",
    ring: "rgba(107,158,87,0.25)",
  },
  violet: {
    bg: "#e2dffb",
    border: "#6a5acd",
    text: "#3d318c",
    ring: "rgba(106,90,205,0.25)",
  },
};

export default function MindMap({ nodes, onChange, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // On first open, show only the root and its direct branches; deeper levels
  // are collapsed so the map opens neatly. The user can then deploy individual
  // branches via chevrons or use the "Déployer" toolbar button.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const rootId = nodes.find((n) => n.parentId === null)?.id;
    if (!rootId) return new Set();
    const ids = new Set<string>();
    for (const n of nodes) {
      if (n.parentId !== rootId) continue;
      const hasChildren = nodes.some((m) => m.parentId === n.id);
      if (hasChildren) ids.add(n.id);
    }
    return ids;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panState = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false,
    startX: 0,
    startY: 0,
    ox: 0,
    oy: 0,
  });

  // Node drag state. Only the dragged node stores its updated offset;
  // descendants follow automatically via the cascade in `layoutMindMap`.
  // `affectedIds` is still tracked so we can identify the subtree for
  // reparent target detection (you can't drop a node onto itself or its
  // descendants).
  const dragState = useRef<{
    active: boolean;
    nodeId: string | null;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    initialOffset: { x: number; y: number };
    affectedIds: Set<string>;
  }>({
    active: false,
    nodeId: null,
    startClientX: 0,
    startClientY: 0,
    moved: false,
    initialOffset: { x: 0, y: 0 },
    affectedIds: new Set(),
  });

  const [reparentTargetId, setReparentTargetId] = useState<string | null>(null);
  const reparentTargetRef = useRef<string | null>(null);

  // Ids of the nodes currently being dragged (the dragged node + its descendants).
  // While the drag is active and has actually moved, those nodes get
  // `pointer-events: none` so `document.elementFromPoint(...)` can pierce
  // through them and find a valid reparent target underneath.
  const [draggingAffectedIds, setDraggingAffectedIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Defensive: deduplicate by node id in case the source data ever ends up with
  // duplicates (e.g. from a malformed save). The first occurrence wins.
  const safeNodes = useMemo(() => {
    const seen = new Set<string>();
    const out: MindNode[] = [];
    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  }, [nodes]);

  // If a corruption produced duplicates, persist the cleaned version.
  useEffect(() => {
    if (readOnly || !onChange) return;
    if (safeNodes.length < nodes.length) onChange(safeNodes);
  }, [safeNodes, nodes, readOnly, onChange]);

  const { layout, width, height } = useMemo(
    () => layoutMindMap(safeNodes, collapsed),
    [safeNodes, collapsed],
  );

  const byId = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    layout.forEach((l) => m.set(l.node.id, l));
    return m;
  }, [layout]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, MindNode[]>();
    for (const n of nodes) {
      if (n.parentId) {
        const arr = m.get(n.parentId) ?? [];
        arr.push(n);
        m.set(n.parentId, arr);
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [nodes]);

  const edges = useMemo(() => {
    const list: { from: LayoutNode; to: LayoutNode }[] = [];
    for (const l of layout) {
      if (!l.node.parentId) continue;
      const parent = byId.get(l.node.parentId);
      if (!parent) continue;
      list.push({ from: parent, to: l });
    }
    return list;
  }, [layout, byId]);

  // Fit-to-screen on first render
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (!clientWidth || !clientHeight) return;
    const margin = 40;
    const sx = (clientWidth - margin * 2) / Math.max(width, 1);
    const sy = (clientHeight - margin * 2) / Math.max(height, 1);
    const s = Math.min(1, Math.min(sx, sy));
    setScale(s);
    setOffset({
      x: (clientWidth - width * s) / 2,
      y: (clientHeight - height * s) / 2,
    });
    // intentionally run only on mount and on initial size of content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width === 0 ? 0 : 1]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (n.parentId !== null) {
        const hasChildren = nodes.some((m) => m.parentId === n.id);
        if (hasChildren) ids.add(n.id);
      }
    }
    setCollapsed(ids);
  }, [nodes]);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  const beginEdit = useCallback(
    (id: string) => {
      if (readOnly) return;
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setEditingId(id);
      setEditingDraft(n.text);
    },
    [nodes, readOnly],
  );

  const commitEdit = useCallback(() => {
    if (!editingId || !onChange) {
      setEditingId(null);
      return;
    }
    const next = nodes.map((n) =>
      n.id === editingId ? { ...n, text: editingDraft.trim() || n.text } : n,
    );
    onChange(next);
    setEditingId(null);
  }, [editingId, editingDraft, nodes, onChange]);

  const addChild = useCallback(
    (parentId: string) => {
      if (readOnly || !onChange) return;
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent) return;
      const siblings = childrenOf.get(parentId) ?? [];
      const palette: NodePalette =
        parent.shape === "root" ? "brand" : parent.palette;
      const newNode: MindNode = {
        id: uuid(),
        parentId,
        text: "Nouvelle idée",
        shape: parent.shape === "root" ? "branch" : "leaf",
        palette,
        order: siblings.length,
      };
      onChange([...nodes, newNode]);
      // expand if collapsed
      setCollapsed((prev) => {
        if (!prev.has(parentId)) return prev;
        const n = new Set(prev);
        n.delete(parentId);
        return n;
      });
      setSelectedId(newNode.id);
      setTimeout(() => beginEdit(newNode.id), 30);
    },
    [readOnly, onChange, nodes, childrenOf, beginEdit],
  );

  const addSibling = useCallback(
    (id: string) => {
      if (readOnly || !onChange) return;
      const node = nodes.find((n) => n.id === id);
      if (!node || !node.parentId) return;
      addChild(node.parentId);
    },
    [readOnly, onChange, nodes, addChild],
  );

  const removeNode = useCallback(
    (id: string) => {
      if (readOnly || !onChange) return;
      const node = nodes.find((n) => n.id === id);
      if (!node || node.parentId === null) return;
      // Remove node + all descendants
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of nodes) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id);
            changed = true;
          }
        }
      }
      onChange(nodes.filter((n) => !toRemove.has(n.id)));
      setSelectedId(null);
    },
    [readOnly, onChange, nodes],
  );

  const changePalette = useCallback(
    (id: string, palette: NodePalette) => {
      if (readOnly || !onChange) return;
      onChange(nodes.map((n) => (n.id === id ? { ...n, palette } : n)));
    },
    [readOnly, onChange, nodes],
  );

  const hasManual = useMemo(
    () => nodes.some((n) => n.manualX !== undefined || n.manualY !== undefined),
    [nodes],
  );

  const stripManual = (n: MindNode): MindNode => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { manualX: _x, manualY: _y, ...rest } = n;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return rest;
  };

  const [pendingRecenter, setPendingRecenter] = useState(false);

  const resetAllLayout = useCallback(() => {
    if (readOnly || !onChange) return;
    onChange(nodes.map(stripManual));
    setPendingRecenter(true);
  }, [readOnly, onChange, nodes]);

  // Build descendant index for subtree drag.
  const descendantsOf = useCallback(
    (id: string) => {
      const acc = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const child of childrenOf.get(cur) ?? []) {
          if (!acc.has(child.id)) {
            acc.add(child.id);
            queue.push(child.id);
          }
        }
      }
      return acc;
    },
    [childrenOf],
  );

  const resetSubtreeLayout = useCallback(
    (id: string) => {
      if (readOnly || !onChange) return;
      const ids = descendantsOf(id);
      ids.add(id);
      onChange(nodes.map((n) => (ids.has(n.id) ? stripManual(n) : n)));
    },
    [readOnly, onChange, nodes, descendantsOf],
  );

  const startNodeDrag = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (readOnly || !onChange) return;
      if (editingId) return;
      e.stopPropagation();
      const desc = descendantsOf(nodeId);
      desc.add(nodeId);
      const dragged = nodes.find((n) => n.id === nodeId);
      dragState.current = {
        active: true,
        nodeId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
        initialOffset: { x: dragged?.manualX ?? 0, y: dragged?.manualY ?? 0 },
        affectedIds: desc,
      };
      setSelectedId(nodeId);
    },
    [readOnly, onChange, editingId, descendantsOf, nodes],
  );

  // Pan
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-node]")) return;
      panState.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      setSelectedId(null);
    },
    [offset],
  );

  useEffect(() => {
    const detectReparentTarget = (clientX: number, clientY: number): string | null => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!el) return null;
      const target = el.closest("[data-node-id]") as HTMLElement | null;
      if (!target) return null;
      const id = target.getAttribute("data-node-id");
      if (!id) return null;
      if (dragState.current.affectedIds.has(id)) return null; // self or descendant
      // Disallow re-parenting onto the current parent (no-op).
      const dragged = nodes.find((n) => n.id === dragState.current.nodeId);
      if (dragged && dragged.parentId === id) return null;
      return id;
    };

    const move = (e: MouseEvent) => {
      // Node drag takes priority over pan.
      if (dragState.current.active && dragState.current.nodeId) {
        const dx = (e.clientX - dragState.current.startClientX) / scale;
        const dy = (e.clientY - dragState.current.startClientY) / scale;
        if (!dragState.current.moved && Math.hypot(dx * scale, dy * scale) > 4) {
          dragState.current.moved = true;
          // Once the drag is real, pierce the dragged subtree so the
          // reparent target detector can find labels underneath.
          setDraggingAffectedIds(new Set(dragState.current.affectedIds));
        }
        if (dragState.current.moved && onChange) {
          // Only update the dragged node's manual offset; descendants follow
          // automatically through the cascade in `layoutMindMap`.
          const draggedId = dragState.current.nodeId;
          const init = dragState.current.initialOffset;
          const next = nodes.map((n) =>
            n.id === draggedId
              ? { ...n, manualX: init.x + dx, manualY: init.y + dy }
              : n,
          );
          onChange(next);
        }
        const tgt = detectReparentTarget(e.clientX, e.clientY);
        if (tgt !== reparentTargetRef.current) {
          reparentTargetRef.current = tgt;
          setReparentTargetId(tgt);
        }
        return;
      }
      if (!panState.current.active) return;
      setOffset({
        x: panState.current.ox + (e.clientX - panState.current.startX),
        y: panState.current.oy + (e.clientY - panState.current.startY),
      });
    };
    const up = () => {
      // If we ended a node drag over a valid reparent target, change parentId
      // and reset manual positions so the new branch lays out cleanly.
      if (
        dragState.current.active &&
        dragState.current.nodeId &&
        dragState.current.moved &&
        onChange &&
        reparentTargetRef.current
      ) {
        const movingId = dragState.current.nodeId;
        const newParentId = reparentTargetRef.current;
        const affected = dragState.current.affectedIds;
        const next = nodes.map((n) => {
          if (!affected.has(n.id)) return n;
          // strip manual positions
          /* eslint-disable @typescript-eslint/no-unused-vars */
          const { manualX: _x, manualY: _y, ...rest } = n;
          /* eslint-enable @typescript-eslint/no-unused-vars */
          if (n.id === movingId) {
            return { ...rest, parentId: newParentId };
          }
          return rest;
        });
        onChange(next);
      }
      panState.current.active = false;
      dragState.current.active = false;
      reparentTargetRef.current = null;
      setReparentTargetId(null);
      setDraggingAffectedIds(new Set());
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [scale, nodes, onChange]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.015 : 1 / 1.015;
      const newScale = Math.min(2.5, Math.max(0.2, scale * factor));
      const ratio = newScale / scale;
      setOffset({
        x: mx - (mx - offset.x) * ratio,
        y: my - (my - offset.y) * ratio,
      });
      setScale(newScale);
    },
    [scale, offset],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (editingId) return;
      if (!selectedId) return;
      if (e.key === "Tab") {
        e.preventDefault();
        addChild(selectedId);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const n = nodes.find((x) => x.id === selectedId);
        if (n?.parentId) addSibling(selectedId);
        else beginEdit(selectedId);
      } else if (e.key === "F2") {
        e.preventDefault();
        beginEdit(selectedId);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeNode(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, editingId, selectedId, addChild, addSibling, removeNode, beginEdit, nodes]);

  const recenter = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const margin = 40;
    const sx = (clientWidth - margin * 2) / Math.max(width, 1);
    const sy = (clientHeight - margin * 2) / Math.max(height, 1);
    const s = Math.min(1, Math.min(sx, sy));
    setScale(s);
    setOffset({
      x: (clientWidth - width * s) / 2,
      y: (clientHeight - height * s) / 2,
    });
  }, [width, height]);

  // After auto-disposition cleared manual positions, the layout dimensions
  // change; we then recentre once the new width/height are reflected.
  useEffect(() => {
    if (!pendingRecenter) return;
    recenter();
    setPendingRecenter(false);
  }, [pendingRecenter, recenter]);

  const childrenCountOf = (id: string) => (childrenOf.get(id)?.length ?? 0);

  return (
    <div
      ref={containerRef}
      className="mindmap-stage relative w-full h-full overflow-hidden select-none"
      onMouseDown={onMouseDown}
      onWheel={onWheel}
    >
      <div
        ref={stageRef}
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width,
          height,
        }}
      >
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          {edges.map(({ from, to }, i) => {
            // Pick the anchor side on each box (left/right/top/bottom) based on
            // which axis dominates the parent-child vector. This makes branches
            // emerge from the top/bottom edges when a child is dragged above
            // or below its parent, rather than always from the lateral sides.
            const ddx = to.x - from.x;
            const ddy = to.y - from.y;
            const horizontal = Math.abs(ddx) >= Math.abs(ddy);

            let x1: number, y1: number, x2: number, y2: number;
            let c1x: number, c1y: number, c2x: number, c2y: number;

            if (horizontal) {
              const sign = ddx >= 0 ? 1 : -1;
              x1 = from.x + (sign * from.width) / 2;
              y1 = from.y;
              x2 = to.x - (sign * to.width) / 2;
              y2 = to.y;
              const cdx = (x2 - x1) * 0.5;
              c1x = x1 + cdx;
              c1y = y1;
              c2x = x2 - cdx;
              c2y = y2;
            } else {
              const sign = ddy >= 0 ? 1 : -1;
              x1 = from.x;
              y1 = from.y + (sign * from.height) / 2;
              x2 = to.x;
              y2 = to.y - (sign * to.height) / 2;
              const cdy = (y2 - y1) * 0.5;
              c1x = x1;
              c1y = y1 + cdy;
              c2x = x2;
              c2y = y2 - cdy;
            }

            const path = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
            const color = PALETTE_STYLE[to.node.palette].border ?? "#c7bda6";
            return (
              <path
                key={i}
                d={path}
                stroke={color}
                strokeWidth={to.depth === 1 ? 2.2 : 1.6}
                fill="none"
                opacity={0.85}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {layout.map((l) => {
          const style = PALETTE_STYLE[l.node.palette];
          const isRoot = l.node.shape === "root";
          const childCount = childrenCountOf(l.node.id);
          const isCollapsed = collapsed.has(l.node.id);
          const isSelected = selectedId === l.node.id;
          const isEditing = editingId === l.node.id;

          const isReparentTarget = reparentTargetId === l.node.id;
          const isBeingDragged = draggingAffectedIds.has(l.node.id);
          return (
            <div
              key={l.node.id}
              data-node
              data-node-id={l.node.id}
              className="absolute"
              style={{
                left: l.x - l.width / 2,
                top: l.y - l.height / 2,
                width: l.width,
                height: l.height,
                pointerEvents: isBeingDragged ? "none" : undefined,
              }}
            >
              <button
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if (!readOnly) startNodeDrag(e, l.node.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  // Suppress click that ended a drag movement.
                  if (dragState.current.moved) {
                    dragState.current.moved = false;
                    return;
                  }
                  setSelectedId(l.node.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  beginEdit(l.node.id);
                }}
                className="group w-full h-full text-left relative"
                style={{
                  ...depthStyle(l.depth, style, isSelected, readOnly),
                  ...(isReparentTarget
                    ? {
                        outline: `3px dashed ${style.border}`,
                        outlineOffset: 4,
                      }
                    : null),
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    className="w-full h-full bg-transparent outline-none resize-none"
                    style={{ color: style.text, fontSize: "inherit", fontFamily: "inherit", fontWeight: "inherit" }}
                  />
                ) : (
                  <span className="block w-full break-words">
                    {l.node.text}
                  </span>
                )}
              </button>

              {childCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(l.node.id);
                  }}
                  title={isCollapsed ? `Déployer (${childCount})` : "Replier"}
                  className="absolute z-10"
                  style={{
                    ...sideButtonPosition(l.side, 0),
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: "#fffefb",
                    border: `1.5px solid ${style.border}`,
                    color: style.border,
                    fontSize: 13,
                    lineHeight: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {isCollapsed
                    ? childCount > 9
                      ? "+"
                      : childCount
                    : chevronGlyph(l.side)}
                </button>
              )}

              {!readOnly && isSelected && !isEditing && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addChild(l.node.id);
                    }}
                    title="Ajouter un enfant (Tab)"
                    className="absolute z-10 pulse-ring"
                    style={{
                      ...sideButtonPosition(l.side, 24),
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: "#0e7c7b",
                      color: "#fff",
                      fontSize: 16,
                      lineHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      border: "none",
                    }}
                  >
                    +
                  </button>
                  {l.node.parentId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNode(l.node.id);
                      }}
                      title="Supprimer cette étiquette (Suppr)"
                      className="absolute z-10"
                      style={{
                        top: -10,
                        right: -10,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: "#fffefb",
                        color: "#a63a1f",
                        fontSize: 14,
                        lineHeight: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        border: "1.5px solid #a63a1f",
                        fontWeight: 700,
                        boxShadow: "0 2px 6px -2px rgba(0,0,0,0.18)",
                      }}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 paper-card px-1 py-1">
        <button
          className="btn btn-soft !py-1 !px-2"
          onClick={() => setScale((s) => Math.max(0.2, s / 1.15))}
          title="Zoom arrière"
        >
          −
        </button>
        <span className="text-xs font-mono w-12 text-center text-[var(--color-ink-soft)]">
          {Math.round(scale * 100)}%
        </span>
        <button
          className="btn btn-soft !py-1 !px-2"
          onClick={() => setScale((s) => Math.min(2.5, s * 1.15))}
          title="Zoom avant"
        >
          +
        </button>
        <div className="w-px h-5 bg-[var(--color-line)] mx-1" />
        <button className="btn btn-soft !py-1 !px-2 text-xs" onClick={recenter} title="Recentrer">
          Centrer
        </button>
        {collapsed.size > 0 ? (
          <button
            className="btn btn-soft !py-1 !px-2 text-xs"
            onClick={expandAll}
            title="Déployer toutes les branches"
          >
            Déployer
          </button>
        ) : (
          <button
            className="btn btn-soft !py-1 !px-2 text-xs"
            onClick={collapseAll}
            title="Concentrer (replier toutes les branches)"
          >
            Concentrer
          </button>
        )}
        {!readOnly && hasManual && (
          <button
            className="btn btn-soft !py-1 !px-2 text-xs"
            onClick={resetAllLayout}
            title="Restaurer la disposition automatique"
          >
            Auto-disposition
          </button>
        )}
      </div>

      {!readOnly && selectedId && (() => {
        const sel = safeNodes.find((n) => n.id === selectedId);
        if (!sel) return null;
        return (
          <SelectionInspector
            node={sel}
            onPalette={(p) => changePalette(selectedId, p)}
            onAddChild={() => addChild(selectedId)}
            onAddSibling={() => addSibling(selectedId)}
            onDelete={() => removeNode(selectedId)}
            onEdit={() => beginEdit(selectedId)}
            onResetLayout={() => resetSubtreeLayout(selectedId)}
          />
        );
      })()}
    </div>
  );
}

function SelectionInspector({
  node,
  onPalette,
  onAddChild,
  onAddSibling,
  onDelete,
  onEdit,
  onResetLayout,
}: {
  node: MindNode;
  onPalette: (p: NodePalette) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onResetLayout: () => void;
}) {
  const isManual = node.manualX !== undefined || node.manualY !== undefined;
  const palettes: NodePalette[] = ["brand", "accent", "leaf", "violet", "ink"];
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 paper-card flex items-center gap-1 px-2 py-1.5 z-20">
      <button className="btn btn-soft !py-1 !px-2 text-xs" onClick={onEdit} title="Renommer (F2)">
        Renommer
      </button>
      <button className="btn btn-soft !py-1 !px-2 text-xs" onClick={onAddChild} title="Enfant (Tab)">
        + Enfant
      </button>
      {node.parentId && (
        <button className="btn btn-soft !py-1 !px-2 text-xs" onClick={onAddSibling} title="Frère (Entrée)">
          + Frère
        </button>
      )}
      <div className="w-px h-5 bg-[var(--color-line)] mx-1" />
      <div className="flex items-center gap-1">
        {palettes.map((p) => (
          <button
            key={p}
            onClick={() => onPalette(p)}
            className="w-5 h-5 rounded-full border"
            style={{
              background: PALETTE_STYLE[p].bg,
              borderColor: PALETTE_STYLE[p].border,
              outline: node.palette === p ? `2px solid ${PALETTE_STYLE[p].border}` : "none",
              outlineOffset: 2,
            }}
            title={p}
            aria-label={`Couleur ${p}`}
          />
        ))}
      </div>
      {isManual && (
        <>
          <div className="w-px h-5 bg-[var(--color-line)] mx-1" />
          <button
            className="btn btn-soft !py-1 !px-2 text-xs"
            onClick={onResetLayout}
            title="Restaurer la disposition automatique de cette branche"
          >
            Recaler
          </button>
        </>
      )}
      {node.parentId && (
        <>
          <div className="w-px h-5 bg-[var(--color-line)] mx-1" />
          <button
            className="btn !py-1 !px-2 text-xs"
            style={{ color: "#a63a1f" }}
            onClick={onDelete}
            title="Supprimer (Suppr)"
          >
            Supprimer
          </button>
        </>
      )}
    </div>
  );
}

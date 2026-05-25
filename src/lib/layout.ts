import type { MindNode } from "./types";

export type LayoutSide = "right" | "left" | "center";

export interface LayoutNode {
  node: MindNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: LayoutSide;
}

interface TreeNode {
  node: MindNode;
  children: TreeNode[];
}

function buildTree(nodes: MindNode[]): TreeNode | null {
  const map = new Map<string, TreeNode>();
  nodes.forEach((n) => map.set(n.id, { node: n, children: [] }));
  let root: TreeNode | null = null;
  for (const n of nodes) {
    const t = map.get(n.id)!;
    if (n.parentId === null) {
      root = t;
    } else {
      const p = map.get(n.parentId);
      if (p) p.children.push(t);
    }
  }
  for (const t of map.values()) {
    t.children.sort((a, b) => a.node.order - b.node.order);
  }
  return root;
}

function measure(text: string, depth: number): { width: number; height: number } {
  const charW = depth === 0 ? 9.5 : depth === 1 ? 8 : 7.2;
  const padX = depth === 0 ? 28 : depth === 1 ? 24 : 20;
  const padY = depth === 0 ? 20 : 15;
  const maxChars = depth === 0 ? 24 : 30;
  const lines = Math.max(1, Math.ceil(text.length / maxChars));
  const lineHeight = depth === 0 ? 26 : 19;
  const longestLine = Math.min(text.length, maxChars);
  return {
    width: Math.max(96, Math.min(longestLine, maxChars) * charW + padX * 2),
    height: lines * lineHeight + padY * 2,
  };
}

function gapsForParentDepth(parentDepth: number): { h: number; v: number } {
  // Horizontal gap = distance between a parent's right edge and its
  // children's left edge (the "breathing room" of the connection line).
  // Vertical gap = spacing between two siblings.
  if (parentDepth === 0) return { h: 180, v: 56 };
  if (parentDepth === 1) return { h: 150, v: 36 };
  if (parentDepth === 2) return { h: 130, v: 28 };
  return { h: 110, v: 24 };
}

interface Pos {
  node: MindNode;
  cx: number;
  cy: number;
  width: number;
  height: number;
  depth: number;
}

interface Subtree {
  positions: Pos[];
  /** total horizontal extent of the subtree's bounding box */
  width: number;
  /** total vertical extent of the subtree's bounding box */
  height: number;
  /** centre x of the *root box* within the subtree */
  rootCx: number;
  /** centre y of the *root box* within the subtree */
  rootCy: number;
}

/**
 * Lay out a subtree horizontally: the root box sits on the left, children
 * are stacked vertically to its right. Each child's translation is chosen so
 * its *root box* x-aligns with its siblings (they form a clean column to the
 * right of the parent), and the parent box is vertically centred against
 * the children stack so connection lines fan symmetrically.
 */
function layoutSubtree(tree: TreeNode, depth: number, collapsedIds: Set<string>): Subtree {
  const { width: nw, height: nh } = measure(tree.node.text, depth);
  const isCollapsed = collapsedIds.has(tree.node.id);
  const visibleChildren = isCollapsed ? [] : tree.children;

  if (visibleChildren.length === 0) {
    return {
      positions: [{ node: tree.node, cx: nw / 2, cy: nh / 2, width: nw, height: nh, depth }],
      width: nw,
      height: nh,
      rootCx: nw / 2,
      rootCy: nh / 2,
    };
  }

  const childLayouts = visibleChildren.map((c) => layoutSubtree(c, depth + 1, collapsedIds));
  const { h: hGap, v: vGap } = gapsForParentDepth(depth);

  const totalChildHeight =
    childLayouts.reduce((s, c) => s + c.height, 0) + vGap * (childLayouts.length - 1);
  const subtreeHeight = Math.max(nh, totalChildHeight);
  const childRootX = nw + hGap;
  const subtreeWidth =
    childRootX + Math.max(...childLayouts.map((c) => c.width - c.rootCx));

  const positions: Pos[] = [];
  const parentCy = subtreeHeight / 2;
  positions.push({ node: tree.node, cx: nw / 2, cy: parentCy, width: nw, height: nh, depth });

  let cursorY = (subtreeHeight - totalChildHeight) / 2;
  for (const c of childLayouts) {
    const dx = childRootX - c.rootCx;
    for (const p of c.positions) {
      positions.push({ ...p, cx: p.cx + dx, cy: p.cy + cursorY });
    }
    cursorY += c.height + vGap;
  }

  return {
    positions,
    width: subtreeWidth,
    height: subtreeHeight,
    rootCx: nw / 2,
    rootCy: parentCy,
  };
}

/**
 * Anchor a subtree's root box at the given screen position. `mirrorX` flips
 * the x axis (used for left-side branches so they grow leftward).
 */
function placeSubtree(
  sub: Subtree,
  rootScreenX: number,
  rootScreenY: number,
  mirrorX: boolean,
  side: LayoutSide,
): LayoutNode[] {
  const out: LayoutNode[] = [];
  for (const p of sub.positions) {
    const dx = p.cx - sub.rootCx;
    const dy = p.cy - sub.rootCy;
    out.push({
      node: p.node,
      x: rootScreenX + (mirrorX ? -dx : dx),
      y: rootScreenY + dy,
      width: p.width,
      height: p.height,
      depth: p.depth,
      side,
    });
  }
  return out;
}

/**
 * Build the global mind map layout.
 *
 * Branches are split into a right column and a left column following a
 * clockwise reading order around the root: the first half of the branches
 * goes on the right (top to bottom), the second half goes on the left
 * (bottom to top). This keeps the layout compact and predictable while
 * preserving the visual sense of a clockwise progression around the root.
 *
 * Manual position overrides are applied at the end with cascading offsets.
 */
export function layoutMindMap(
  nodes: MindNode[],
  collapsedIds: Set<string>,
): { layout: LayoutNode[]; width: number; height: number } {
  const tree = buildTree(nodes);
  if (!tree) return { layout: [], width: 0, height: 0 };

  const { width: rootW, height: rootH } = measure(tree.node.text, 0);
  const isRootCollapsed = collapsedIds.has(tree.node.id);
  const visibleChildren = isRootCollapsed ? [] : tree.children;

  const N = visibleChildren.length;

  // First half clockwise → right side (top to bottom)
  // Second half clockwise → left side (bottom to top)
  const half = Math.ceil(N / 2);
  const rightTrees = visibleChildren.slice(0, half);
  const leftTrees = visibleChildren.slice(half);
  // Reverse the left side so iteration top-to-bottom on screen reflects the
  // clockwise order (which goes bottom-to-top on the left of the root).
  leftTrees.reverse();

  const subsRight = rightTrees.map((c) => layoutSubtree(c, 1, collapsedIds));
  const subsLeft = leftTrees.map((c) => layoutSubtree(c, 1, collapsedIds));

  const { h: rootGapH, v: rootGapV } = gapsForParentDepth(0);

  const sumHeight = (arr: Subtree[]) =>
    arr.length === 0
      ? 0
      : arr.reduce((s, x) => s + x.height, 0) + rootGapV * (arr.length - 1);

  const verticalStackRight = sumHeight(subsRight);
  const verticalStackLeft = sumHeight(subsLeft);

  const rootX = 0;
  const rootY = 0;

  const layout: LayoutNode[] = [];
  layout.push({
    node: tree.node,
    x: rootX,
    y: rootY,
    width: rootW,
    height: rootH,
    depth: 0,
    side: "center",
  });

  // Right side: branches stacked vertically, growing rightward.
  {
    let cursor = rootY - verticalStackRight / 2;
    for (const sub of subsRight) {
      const boxScreenX = rootX + rootW / 2 + rootGapH + sub.rootCx;
      const boxScreenY = cursor + sub.rootCy;
      layout.push(...placeSubtree(sub, boxScreenX, boxScreenY, false, "right"));
      cursor += sub.height + rootGapV;
    }
  }
  // Left side: mirror on X to grow leftward.
  {
    let cursor = rootY - verticalStackLeft / 2;
    for (const sub of subsLeft) {
      const boxScreenX = rootX - rootW / 2 - rootGapH - sub.rootCx;
      const boxScreenY = cursor + sub.rootCy;
      layout.push(...placeSubtree(sub, boxScreenX, boxScreenY, true, "left"));
      cursor += sub.height + rootGapV;
    }
  }

  // Apply manual offsets with cascade. `manualX`/`manualY` are *deltas*
  // (offsets from the auto-computed position), not absolute coordinates,
  // so they survive layout-shifts cleanly. A node moved by the user keeps
  // its descendants relative to it because we cascade the same offset.
  const byId = new Map<string, LayoutNode>();
  layout.forEach((l) => byId.set(l.node.id, l));

  const visit = (node: TreeNode, accDx: number, accDy: number) => {
    const lp = byId.get(node.node.id);
    if (!lp) return;
    const myDx = node.node.manualX ?? 0;
    const myDy = node.node.manualY ?? 0;
    const totalDx = accDx + myDx;
    const totalDy = accDy + myDy;
    lp.x += totalDx;
    lp.y += totalDy;
    for (const c of node.children) visit(c, totalDx, totalDy);
  };
  visit(tree, 0, 0);

  // Shift everything to positive coords with a generous margin.
  const minX = Math.min(...layout.map((p) => p.x - p.width / 2));
  const minY = Math.min(...layout.map((p) => p.y - p.height / 2));
  const maxX = Math.max(...layout.map((p) => p.x + p.width / 2));
  const maxY = Math.max(...layout.map((p) => p.y + p.height / 2));
  const margin = 80;
  const dx = -minX + margin;
  const dy = -minY + margin;
  for (const p of layout) {
    p.x += dx;
    p.y += dy;
  }

  return {
    layout,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

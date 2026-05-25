import { v4 as uuid } from "uuid";
import type { MindNode, NodePalette } from "./types";

interface ParsedLine {
  indent: number;
  text: string;
}

const PALETTES: NodePalette[] = ["brand", "accent", "leaf", "violet"];

function paletteForBranch(branchIndex: number): NodePalette {
  return PALETTES[branchIndex % PALETTES.length];
}

function cleanLine(raw: string): string {
  // Strip "N enfants" / "N enfant" annotations and trailing markdown bullets.
  return raw
    .replace(/^\s*[-*+]\s*/, "")
    .replace(/^\s*#+\s*/, "")
    .replace(/,\s*\d+\s+enfants?\s*$/i, "")
    .trim();
}

/**
 * Parse a flexible Markdown outline.
 *
 * The first `#` (H1) line becomes the document title. Subsequent headings
 * `##`, `###`, `####`, … become nodes at depth 0, 1, 2 …
 *
 * Bullet lines `- text` (or `*` / `+`) are positioned relative to the most
 * recent heading: a non-indented bullet just below `## H` becomes a child of
 * `H`. Two-space indents add depth, like any outline.
 */
function parseMarkdownOutline(markdown: string): ParsedLine[] {
  const lines = markdown.split(/\r?\n/);
  const out: ParsedLine[] = [];
  let titleSeen = false;
  let headingDepth = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const headingMatch = line.match(/^(#+)\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = cleanLine(headingMatch[2]);
      if (level === 1) {
        if (!titleSeen) {
          titleSeen = true;
          continue;
        }
        if (text) out.push({ indent: 0, text });
        headingDepth = 0;
        continue;
      }
      const indent = level - 2; // ## → 0, ### → 1, etc.
      if (text) out.push({ indent, text });
      headingDepth = indent + 1; // bullets that follow are children
      continue;
    }

    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const spaces = bulletMatch[1].replace(/\t/g, "  ").length;
      const indentRel = Math.floor(spaces / 2);
      const text = cleanLine(bulletMatch[2]);
      if (!text) continue;
      out.push({ indent: headingDepth + indentRel, text });
      continue;
    }
  }

  return out;
}

/**
 * Convert an indented Markdown outline into a flat list of MindNodes
 * with a single root.
 */
export function markdownToMindNodes(
  markdown: string,
  rootTitle: string,
): { title: string; nodes: MindNode[] } {
  const parsed = parseMarkdownOutline(markdown);

  const titleFromH1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = titleFromH1 || rootTitle;

  const rootId = uuid();
  const nodes: MindNode[] = [
    {
      id: rootId,
      parentId: null,
      text: title,
      shape: "root",
      palette: "ink",
      order: 0,
    },
  ];

  // Stack of last node per indent level
  const stack: { id: string; indent: number; branchIndex: number }[] = [
    { id: rootId, indent: -1, branchIndex: -1 },
  ];

  let branchCounter = 0;
  const childOrderByParent = new Map<string, number>();

  for (const line of parsed) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= line.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const isTopLevel = parent.id === rootId;
    const branchIndex = isTopLevel ? branchCounter++ : parent.branchIndex;
    const id = uuid();
    const order = (childOrderByParent.get(parent.id) ?? 0);
    childOrderByParent.set(parent.id, order + 1);

    nodes.push({
      id,
      parentId: parent.id,
      text: line.text,
      shape: isTopLevel ? "branch" : "leaf",
      palette: paletteForBranch(branchIndex),
      order,
    });
    stack.push({ id, indent: line.indent, branchIndex });
  }

  return { title, nodes };
}

/**
 * Re-parse a markdown outline while preserving existing node identity.
 *
 * Nodes are matched by their full text path (root → … → node). When matched,
 * the existing id, palette and manual position are kept. The root is always
 * matched to the existing root, even if the H1 title was edited.
 */
export function reconcileFromMarkdown(
  markdown: string,
  existing: MindNode[],
): { title: string; nodes: MindNode[] } {
  const fresh = markdownToMindNodes(markdown, "Carte sans titre");

  const existingChildren = new Map<string | null, MindNode[]>();
  for (const n of existing) {
    const arr = existingChildren.get(n.parentId) ?? [];
    arr.push(n);
    existingChildren.set(n.parentId, arr);
  }
  for (const arr of existingChildren.values()) arr.sort((a, b) => a.order - b.order);

  const existingByPath = new Map<string, MindNode>();
  const visit = (n: MindNode, path: string) => {
    const myPath = `${path}/${n.text}`;
    if (!existingByPath.has(myPath)) existingByPath.set(myPath, n);
    for (const c of existingChildren.get(n.id) ?? []) visit(c, myPath);
  };
  const existingRoot = existing.find((n) => n.parentId === null);
  if (existingRoot) visit(existingRoot, "");

  const freshChildren = new Map<string | null, MindNode[]>();
  for (const n of fresh.nodes) {
    const arr = freshChildren.get(n.parentId) ?? [];
    arr.push(n);
    freshChildren.set(n.parentId, arr);
  }
  for (const arr of freshChildren.values()) arr.sort((a, b) => a.order - b.order);

  const idMap = new Map<string, string>();
  const reconciled: MindNode[] = [];
  const usedExistingIds = new Set<string>();
  const freshRoot = fresh.nodes.find((n) => n.parentId === null);
  if (!freshRoot) return fresh;

  const visitFresh = (n: MindNode, path: string, isRoot: boolean) => {
    const myPath = `${path}/${n.text}`;
    let match: MindNode | undefined;
    if (isRoot && existingRoot) match = existingRoot;
    else {
      const candidate = existingByPath.get(myPath);
      if (candidate && !usedExistingIds.has(candidate.id)) match = candidate;
    }
    if (match) usedExistingIds.add(match.id);
    const reconciledId = match ? match.id : n.id;
    idMap.set(n.id, reconciledId);
    const out: MindNode = {
      ...n,
      id: reconciledId,
      palette: match?.palette ?? n.palette,
    };
    if (match?.manualX !== undefined) out.manualX = match.manualX;
    if (match?.manualY !== undefined) out.manualY = match.manualY;
    reconciled.push(out);
    for (const c of freshChildren.get(n.id) ?? []) visitFresh(c, myPath, false);
  };
  visitFresh(freshRoot, "", true);

  for (const n of reconciled) {
    if (n.parentId) n.parentId = idMap.get(n.parentId) ?? n.parentId;
  }

  return { title: fresh.title, nodes: reconciled };
}

/**
 * Convert a tree of MindNodes into a Markdown outline.
 *
 * Top-level branches are H2 (`##`), then H3, H4, then bullets with two-space
 * indentation for any deeper levels. The doc title is rendered as H1.
 */
export function nodesToMarkdown(title: string, nodes: MindNode[]): string {
  const lines: string[] = [`# ${title}`, ""];
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return lines.join("\n");

  const childrenOf = new Map<string, MindNode[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n);
      childrenOf.set(n.parentId, arr);
    }
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.order - b.order);

  const HEADING_DEPTH = 3; // depths 1..3 use H2..H4; deeper depths use bullets

  const walk = (id: string, depth: number) => {
    for (const c of childrenOf.get(id) ?? []) {
      if (depth <= HEADING_DEPTH) {
        const hashes = "#".repeat(depth + 1); // depth 1 → ##, depth 2 → ###, …
        if (lines.length && lines[lines.length - 1] !== "") lines.push("");
        lines.push(`${hashes} ${c.text}`);
      } else {
        const indent = "  ".repeat(depth - HEADING_DEPTH - 1);
        lines.push(`${indent}- ${c.text}`);
      }
      walk(c.id, depth + 1);
    }
  };
  walk(root.id, 1);
  return lines.join("\n");
}

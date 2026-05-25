export type NodeShape = "root" | "branch" | "leaf";
export type NodePalette = "ink" | "brand" | "accent" | "leaf" | "violet";

export interface MindNode {
  id: string;
  parentId: string | null;
  text: string;
  shape: NodeShape;
  palette: NodePalette;
  collapsed?: boolean;
  order: number;
  /** Optional manual position override (relative to the auto-layout). */
  manualX?: number;
  manualY?: number;
}

export interface MindMapDoc {
  id: string;
  title: string;
  ownerId: string;
  ownerEmail?: string | null;
  nodes: MindNode[];
  shareToken: string | null;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MindMapSummary {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: number;
  nodeCount: number;
  isPublic: boolean;
}

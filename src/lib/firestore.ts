"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { v4 as uuid } from "uuid";
import { getDb } from "./firebase";
import type { MindMapDoc, MindMapSummary, MindNode } from "./types";

const COLL = "mindmaps";

function tsToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}

function deserializeMap(id: string, data: Record<string, unknown>): MindMapDoc {
  return {
    id,
    title: (data.title as string) ?? "Carte sans titre",
    ownerId: (data.ownerId as string) ?? "",
    ownerEmail: (data.ownerEmail as string | null) ?? null,
    nodes: ((data.nodes as MindNode[]) ?? []) as MindNode[],
    shareToken: (data.shareToken as string | null) ?? null,
    isPublic: Boolean(data.isPublic),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export async function createMap(input: {
  ownerId: string;
  ownerEmail?: string | null;
  title: string;
  nodes: MindNode[];
}): Promise<string> {
  const db = getDb();
  const id = uuid();
  await setDoc(doc(db, COLL, id), {
    title: input.title,
    ownerId: input.ownerId,
    ownerEmail: input.ownerEmail ?? null,
    nodes: input.nodes,
    shareToken: null,
    isPublic: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function listMapsForUser(ownerId: string): Promise<MindMapSummary[]> {
  const db = getDb();
  const q = query(
    collection(db, COLL),
    where("ownerId", "==", ownerId),
    orderBy("updatedAt", "desc"),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      title: (data.title as string) ?? "Carte sans titre",
      ownerId: (data.ownerId as string) ?? "",
      updatedAt: tsToMillis(data.updatedAt),
      nodeCount: ((data.nodes as MindNode[]) ?? []).length,
      isPublic: Boolean(data.isPublic),
    };
  });
}

export async function getMap(id: string): Promise<MindMapDoc | null> {
  const db = getDb();
  const ref = doc(db, COLL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return deserializeMap(snap.id, snap.data());
}

export async function getMapByShareToken(token: string): Promise<MindMapDoc | null> {
  const db = getDb();
  const q = query(
    collection(db, COLL),
    where("shareToken", "==", token),
    where("isPublic", "==", true),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return deserializeMap(d.id, d.data());
}

export async function saveMap(id: string, patch: Partial<MindMapDoc>): Promise<void> {
  const db = getDb();
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.nodes !== undefined) data.nodes = patch.nodes;
  if (patch.shareToken !== undefined) data.shareToken = patch.shareToken;
  if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
  await updateDoc(doc(db, COLL, id), data);
}

export async function deleteMap(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, COLL, id));
}

export async function enableSharing(id: string): Promise<string> {
  const token = uuid().replace(/-/g, "").slice(0, 16);
  await saveMap(id, { shareToken: token, isPublic: true });
  return token;
}

export async function disableSharing(id: string): Promise<void> {
  await saveMap(id, { shareToken: null, isPublic: false });
}

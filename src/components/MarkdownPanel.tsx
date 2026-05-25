"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindNode } from "@/lib/types";
import { reconcileFromMarkdown, nodesToMarkdown } from "@/lib/markdown";

interface Props {
  title: string;
  nodes: MindNode[];
  readOnly?: boolean;
  onChange: (next: { title: string; nodes: MindNode[] }) => void;
  onClose: () => void;
}

const MIN_WIDTH = 280;
const MAX_WIDTH_RATIO = 0.7;
const STORAGE_KEY = "mindkit:markdown-panel-width";

export function MarkdownPanel({ title, nodes, readOnly = false, onChange, onClose }: Props) {
  const externalMarkdown = useMemo(() => nodesToMarkdown(title, nodes), [title, nodes]);

  const [draft, setDraft] = useState(externalMarkdown);
  const [width, setWidth] = useState<number>(420);
  const [copied, setCopied] = useState(false);

  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n)) setWidth(n);
    }
  }, []);

  // Sync draft from external markdown when the panel is not currently
  // being edited. Once the user types, dirtyRef is set; we then ignore
  // upstream updates to avoid clobbering their input.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(externalMarkdown);
  }, [externalMarkdown]);

  const applyDraft = useCallback(
    (md: string) => {
      const result = reconcileFromMarkdown(md, nodes);
      onChange(result);
      dirtyRef.current = false;
    },
    [nodes, onChange],
  );

  const onTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (readOnly) return;
      const v = e.target.value;
      setDraft(v);
      dirtyRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => applyDraft(v), 600);
    },
    [readOnly, applyDraft],
  );

  const onTextBlur = useCallback(() => {
    if (readOnly) return;
    if (!dirtyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyDraft(draft);
  }, [readOnly, applyDraft, draft]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Resize logic
  const resizeStateRef = useRef<{ active: boolean; startX: number; startW: number }>({
    active: false,
    startX: 0,
    startW: 0,
  });
  const startResize = (e: React.MouseEvent) => {
    resizeStateRef.current = { active: true, startX: e.clientX, startW: width };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeStateRef.current.active) return;
      const delta = resizeStateRef.current.startX - e.clientX; // dragging left = wider
      const proposed = resizeStateRef.current.startW + delta;
      const max = Math.floor(window.innerWidth * MAX_WIDTH_RATIO);
      const next = Math.max(MIN_WIDTH, Math.min(max, proposed));
      setWidth(next);
    };
    const onUp = () => {
      if (!resizeStateRef.current.active) return;
      resizeStateRef.current.active = false;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, String(width));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "mindkit"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      className="relative shrink-0 border-l border-[var(--color-line)] bg-[var(--color-paper)] flex flex-col fade-up"
      style={{ width, animationDuration: "180ms" }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        title="Glisser pour redimensionner"
        className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize z-10 group"
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--color-line)] group-hover:bg-[var(--color-brand)] transition-colors" />
      </div>

      <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--color-line)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MarkdownIcon />
          <span className="font-display text-base">Vue Markdown</span>
          {!readOnly && dirtyRef.current && (
            <span className="text-[10px] text-[var(--color-accent)]">● modifié</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copy} className="btn btn-soft !py-1 !px-2 text-xs" title="Copier">
            {copied ? "Copié ✓" : "Copier"}
          </button>
          <button onClick={download} className="btn btn-soft !py-1 !px-2 text-xs" title="Télécharger .md">
            .md
          </button>
          <button
            onClick={onClose}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-lg leading-none px-1"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={onTextChange}
        onBlur={onTextBlur}
        readOnly={readOnly}
        spellCheck={false}
        aria-label="Édition Markdown de la carte"
        className="flex-1 w-full resize-none bg-transparent px-4 py-3 text-xs font-mono leading-relaxed text-[var(--color-ink)] focus:outline-none scroll-thin"
      />

      <div className="px-4 py-2 border-t border-[var(--color-line)] text-[10px] text-[var(--color-ink-muted)] leading-snug">
        {readOnly ? (
          <>Lecture seule — vous n&apos;êtes pas le propriétaire.</>
        ) : (
          <>
            Indentez avec <kbd className="font-mono">2 espaces</kbd> par niveau.
            Le titre <kbd className="font-mono">#</kbd> et chaque ligne <kbd className="font-mono">- texte</kbd> deviennent des bulles.
            Mises à jour live, identifiants & couleurs préservés quand le texte ne change pas.
          </>
        )}
      </div>
    </aside>
  );
}

function MarkdownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 15V9l2.5 3L11 9v6M15 9v6m0 0-1.5-1.5M15 15l1.5-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

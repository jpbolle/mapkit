"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { getMap, saveMap } from "@/lib/firestore";
import type { MindMapDoc, MindNode } from "@/lib/types";
import { Logo } from "@/components/Logo";
import { ShareDialog } from "@/components/ShareDialog";
import { MarkdownPanel } from "@/components/MarkdownPanel";

const MindMap = dynamic(() => import("@/components/MindMap"), { ssr: false });

type SaveState = "idle" | "saving" | "saved" | "error";

export default function MapEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();

  const [doc, setDoc] = useState<MindMapDoc | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showShare, setShowShare] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const m = await getMap(id);
        if (!m) {
          setNotFound(true);
          return;
        }
        setDoc(m);
      } finally {
        setLoadingMap(false);
      }
    };
    load();
  }, [id]);

  // Auto-save debouncer
  const pendingPatch = useRef<{ title?: string; nodes?: MindNode[] } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(async () => {
    if (!pendingPatch.current) return;
    const patch = pendingPatch.current;
    pendingPatch.current = null;
    setSaveState("saving");
    try {
      await saveMap(id, patch);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch {
      setSaveState("error");
    }
  }, [id]);

  const queueSave = useCallback(
    (patch: { title?: string; nodes?: MindNode[] }) => {
      pendingPatch.current = { ...(pendingPatch.current ?? {}), ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 700);
    },
    [flushSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const onTitleChange = (title: string) => {
    if (!doc) return;
    setDoc({ ...doc, title });
    queueSave({ title });
  };

  const onNodesChange = (nodes: MindNode[]) => {
    if (!doc) return;
    setDoc({ ...doc, nodes });
    queueSave({ nodes });
  };

  const onMarkdownChange = (next: { title: string; nodes: MindNode[] }) => {
    if (!doc) return;
    setDoc({ ...doc, title: next.title, nodes: next.nodes });
    queueSave({ title: next.title, nodes: next.nodes });
  };

  const onSharingChange = (next: { shareToken: string | null; isPublic: boolean }) => {
    if (!doc) return;
    setDoc({ ...doc, ...next });
  };

  const isOwner = useMemo(() => !!user && !!doc && user.uid === doc.ownerId, [user, doc]);

  if (loading || loadingMap) {
    return (
      <div className="min-h-dvh grid place-items-center text-[var(--color-ink-muted)]">
        Chargement de la carte…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="paper-card p-8 text-center max-w-md">
          <h2 className="font-display text-2xl">Carte introuvable</h2>
          <p className="mt-2 text-[var(--color-ink-soft)]">
            Cette carte n&apos;existe pas ou a été supprimée.
          </p>
          <button onClick={() => router.push("/")} className="btn btn-brand mt-4">
            Retour à l&apos;atelier
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="paper-card p-8 text-center max-w-md">
          <h2 className="font-display text-2xl">Connexion requise</h2>
          <p className="mt-2 text-[var(--color-ink-soft)]">
            Connectez-vous pour ouvrir cette carte.
          </p>
          <button onClick={() => router.push("/")} className="btn btn-brand mt-4">
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="h-dvh flex flex-col">
      {/* Two-row header */}
      <header className="border-b border-[var(--color-line)] bg-[rgba(255,253,248,0.85)] backdrop-blur z-20">
        <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <button
              onClick={() => router.push("/")}
              className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] flex items-center gap-1.5"
              title="Retour"
            >
              <ArrowLeft />
              <span className="hidden md:inline text-sm">Atelier</span>
            </button>
            <div className="w-px h-5 bg-[var(--color-line)]" />
            <input
              value={doc.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Titre de la carte"
              disabled={!isOwner}
              className="font-display text-xl md:text-2xl tracking-tight bg-transparent outline-none focus:outline-none flex-1 min-w-0 truncate placeholder:text-[var(--color-ink-muted)]"
            />
            <SaveBadge state={saveState} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowMarkdown((v) => !v)}
              className={`btn text-xs ${showMarkdown ? "btn-soft" : "btn-ghost"}`}
              title="Voir/cacher la vue Markdown"
              aria-pressed={showMarkdown}
            >
              <MarkdownIcon /> Markdown
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="btn btn-brand text-xs"
              title="Partager avec mes élèves"
            >
              <ShareIcon />
              Partager
              {doc.isPublic && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[var(--color-leaf-soft)] inline-block" />
              )}
            </button>
            <Logo size={22} />
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex">
        <div className="flex-1 relative">
          <MindMap nodes={doc.nodes} onChange={onNodesChange} readOnly={!isOwner} />
        </div>
        {showMarkdown && (
          <MarkdownPanel
            title={doc.title}
            nodes={doc.nodes}
            readOnly={!isOwner}
            onChange={onMarkdownChange}
            onClose={() => setShowMarkdown(false)}
          />
        )}
      </main>

      {showShare && (
        <ShareDialog
          mapId={id}
          initialToken={doc.shareToken}
          initialPublic={doc.isPublic}
          onChange={onSharingChange}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const cfg = {
    idle: { text: "Auto-enregistrement", color: "var(--color-ink-muted)", dot: "var(--color-line-strong)" },
    saving: { text: "Enregistrement…", color: "var(--color-ink-soft)", dot: "var(--color-accent)" },
    saved: { text: "Enregistré", color: "var(--color-ink-soft)", dot: "var(--color-leaf)" },
    error: { text: "Erreur d'enregistrement", color: "#a63a1f", dot: "#a63a1f" },
  }[state];
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs" style={{ color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {cfg.text}
    </span>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16 8a3 3 0 1 0-2.83-4M8 12a3 3 0 1 0 0 0Zm8 4a3 3 0 1 0-2.83-4M8 12l5-3m-5 3 5 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

function ArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

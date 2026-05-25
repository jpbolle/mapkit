"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/AuthShell";
import { Logo } from "@/components/Logo";
import {
  createMap,
  deleteMap,
  listMapsForUser,
} from "@/lib/firestore";
import { markdownToMindNodes } from "@/lib/markdown";
import type { MindMapSummary } from "@/lib/types";
import { SEED_MARKDOWN, SEED_TITLE } from "@/lib/seed";

export default function HomePage() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const [maps, setMaps] = useState<MindMapSummary[]>([]);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoadingMaps(true);
    try {
      const data = await listMapsForUser(user.uid);
      setMaps(data);
    } finally {
      setLoadingMaps(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSeedMap = async () => {
    if (!user || seeding) return;
    setSeeding(true);
    try {
      const { title, nodes } = markdownToMindNodes(SEED_MARKDOWN, SEED_TITLE);
      const id = await createMap({
        ownerId: user.uid,
        ownerEmail: user.email,
        title,
        nodes,
      });
      router.push(`/maps/${id}`);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[var(--color-ink-muted)]">
        Chargement…
      </div>
    );
  }

  if (!user) return <AuthShell />;

  const createBlank = async () => {
    const { nodes, title } = markdownToMindNodes(
      "# Nouvelle carte\n- Idée centrale\n",
      "Nouvelle carte",
    );
    const id = await createMap({
      ownerId: user.uid,
      ownerEmail: user.email,
      title,
      nodes,
    });
    router.push(`/maps/${id}`);
  };

  const importMarkdown = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const { title, nodes } = markdownToMindNodes(
        text,
        file.name.replace(/\.[^.]+$/, ""),
      );
      const id = await createMap({
        ownerId: user.uid,
        ownerEmail: user.email,
        title,
        nodes,
      });
      router.push(`/maps/${id}`);
    };
    input.click();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer définitivement cette carte ?")) return;
    await deleteMap(id);
    await refresh();
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[rgba(255,253,248,0.7)] backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-[var(--color-ink-soft)]">
              {user.email}
            </span>
            <div className="w-9 h-9 rounded-full bg-[var(--color-brand)] text-white grid place-items-center font-display text-base">
              {(user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <button onClick={signOutUser} className="btn btn-ghost text-xs">
              Se déconnecter
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="fade-up">
            <p className="chip">Atelier</p>
            <h1 className="mt-3 font-display text-5xl md:text-6xl tracking-tight leading-[1.02]">
              Vos cartes
            </h1>
            <p className="mt-3 text-[var(--color-ink-soft)] max-w-xl">
              Une carte par leçon, par chapitre, ou par projet. Cliquez pour ouvrir,
              partagez en un lien.
            </p>
          </div>
          <div className="flex items-center gap-2 fade-up" style={{ animationDelay: "100ms" }}>
            <button onClick={importMarkdown} className="btn btn-ghost">
              <ImportIcon /> Importer Markdown
            </button>
            <button onClick={createBlank} className="btn btn-brand">
              <PlusIcon /> Nouvelle carte
            </button>
          </div>
        </div>

        <section className="mt-10">
          {loadingMaps && maps.length === 0 ? (
            <p className="text-[var(--color-ink-muted)]">Chargement de vos cartes…</p>
          ) : maps.length === 0 ? (
            <div className="paper-card p-10 text-center">
              <h3 className="font-display text-2xl">Votre atelier est vide</h3>
              <p className="mt-2 text-[var(--color-ink-soft)]">
                Créez une carte vierge, importez un fichier Markdown, ou démarrez
                avec la carte d&apos;exemple sur les 7 piliers de la neuroéducation.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button onClick={createBlank} className="btn btn-brand">
                  <PlusIcon /> Nouvelle carte
                </button>
                <button onClick={importMarkdown} className="btn btn-ghost">
                  <ImportIcon /> Importer Markdown
                </button>
                <button onClick={createSeedMap} disabled={seeding} className="btn btn-soft">
                  {seeding ? "Création…" : "Charger la carte d'exemple"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {maps.map((m, i) => (
                <div
                  key={m.id}
                  className="paper-card p-5 hover:shadow-md transition-shadow fade-up"
                  style={{ animationDelay: `${60 + i * 30}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-xl leading-tight">
                      <button
                        className="text-left hover:underline"
                        onClick={() => router.push(`/maps/${m.id}`)}
                      >
                        {m.title}
                      </button>
                    </h3>
                    {m.isPublic && (
                      <span className="chip" title="Partagée">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-leaf)]" /> Partagée
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                    {m.nodeCount} nœud{m.nodeCount > 1 ? "s" : ""} • mis à jour le{" "}
                    {new Date(m.updatedAt).toLocaleDateString("fr-BE", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/maps/${m.id}`)}
                      className="btn btn-soft text-xs"
                    >
                      Ouvrir
                    </button>
                    <button
                      onClick={() => remove(m.id)}
                      className="btn !py-1.5 text-xs text-[#a63a1f] hover:bg-[#fbe4d6]"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getMapByShareToken } from "@/lib/firestore";
import type { MindMapDoc } from "@/lib/types";
import { Logo } from "@/components/Logo";

const MindMap = dynamic(() => import("@/components/MindMap"), { ssr: false });

export default function SharedMapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [doc, setDoc] = useState<MindMapDoc | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    (async () => {
      const m = await getMapByShareToken(token);
      if (!m) {
        setState("missing");
        return;
      }
      setDoc(m);
      setState("ok");
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <div className="min-h-dvh grid place-items-center text-[var(--color-ink-muted)]">
        Chargement de la carte partagée…
      </div>
    );
  }

  if (state === "missing" || !doc) {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="paper-card p-8 text-center max-w-md">
          <h2 className="font-display text-2xl">Lien non valide</h2>
          <p className="mt-2 text-[var(--color-ink-soft)]">
            Ce lien de partage a été révoqué ou n&apos;existe plus.
            Demandez à votre enseignant un nouveau lien.
          </p>
          <Link href="/" className="btn btn-brand mt-4 inline-flex">
            Aller à MindKit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      <header className="border-b border-[var(--color-line)] bg-[rgba(255,253,248,0.85)] backdrop-blur">
        <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={22} />
            <div className="w-px h-5 bg-[var(--color-line)]" />
            <h1 className="font-display text-xl md:text-2xl tracking-tight truncate">
              {doc.title}
            </h1>
          </div>
          <span className="chip">
            <EyeIcon /> Lecture seule
          </span>
        </div>
        <div className="px-4 md:px-6 h-9 flex items-center text-[11px] text-[var(--color-ink-muted)]">
          Cliquez sur les chevrons pour déployer les branches • Molette pour zoomer • Glisser pour déplacer
        </div>
      </header>
      <main className="flex-1 relative">
        <MindMap nodes={doc.nodes} readOnly />
      </main>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

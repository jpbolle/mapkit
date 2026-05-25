"use client";

import { useEffect, useState } from "react";
import { disableSharing, enableSharing, saveMap } from "@/lib/firestore";

interface Props {
  mapId: string;
  initialToken: string | null;
  initialPublic: boolean;
  onChange: (next: { shareToken: string | null; isPublic: boolean }) => void;
  onClose: () => void;
}

export function ShareDialog({ mapId, initialToken, initialPublic, onChange, onClose }: Props) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const link = token ? `${origin}/share/${token}` : "";

  const enable = async () => {
    setBusy(true);
    try {
      const t = await enableSharing(mapId);
      setToken(t);
      setIsPublic(true);
      onChange({ shareToken: t, isPublic: true });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disableSharing(mapId);
      setToken(null);
      setIsPublic(false);
      onChange({ shareToken: null, isPublic: false });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      // Burn the current token by disabling, then create a fresh one.
      await disableSharing(mapId);
      const t = await enableSharing(mapId);
      setToken(t);
      setIsPublic(true);
      onChange({ shareToken: t, isPublic: true });
    } finally {
      setBusy(false);
    }
  };

  const togglePublic = async (next: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      await saveMap(mapId, { isPublic: next });
      setIsPublic(next);
      onChange({ shareToken: token, isPublic: next });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[rgba(26,29,36,0.35)] backdrop-blur-sm grid place-items-center px-4"
      onClick={onClose}
    >
      <div
        className="paper-card w-full max-w-md p-6 fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Partager la carte"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl leading-tight">Partager avec vos élèves</h2>
            <p className="text-sm text-[var(--color-ink-soft)] mt-1">
              Vos élèves verront la carte en lecture seule, sans devoir créer de compte.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-xl leading-none p-1"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {!token ? (
          <div className="mt-6">
            <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] p-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-brand-soft)] grid place-items-center text-[var(--color-brand)]">
                <LinkIcon />
              </div>
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                Activez le partage pour générer un lien sécurisé en lecture seule.
              </p>
              <button
                onClick={enable}
                disabled={busy}
                className="btn btn-brand mt-4"
              >
                {busy ? "Activation…" : "Activer le partage"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-ink-soft)]">
                Lien à partager
              </label>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  readOnly
                  value={link}
                  className="input font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button onClick={copy} className="btn btn-brand whitespace-nowrap">
                  {copied ? "Copié ✓" : "Copier"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[var(--color-paper-2)] px-4 py-3">
              <div>
                <p className="text-sm font-medium">Lien actif</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {isPublic ? "Accessible à toute personne avec le lien." : "Désactivé. Le lien renverra une erreur."}
                </p>
              </div>
              <Switch checked={isPublic} onChange={togglePublic} disabled={busy} />
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={regenerate}
                disabled={busy}
                className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] underline underline-offset-2"
              >
                Générer un nouveau lien
              </button>
              <button
                onClick={disable}
                disabled={busy}
                className="text-[#a63a1f] hover:underline"
              >
                Arrêter le partage
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{
        background: checked ? "var(--color-brand)" : "var(--color-line-strong)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function LinkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14a5 5 0 0 1 0-7l3-3a5 5 0 1 1 7 7l-1.5 1.5M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 1 1-7-7l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

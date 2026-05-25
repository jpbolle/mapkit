"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "./Logo";

export function AuthShell() {
  const { configured, signInWithGoogle, signInEmail, signUpEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signInEmail(email, password);
      else await signUpEmail(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'authentification");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur Google");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh w-full flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[920px] grid md:grid-cols-[1.1fr_1fr] gap-10 items-center">
        <section className="fade-up">
          <div className="mb-8"><Logo size={34} /></div>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.02] tracking-tight">
            Une carte vaut mille
            <br />
            <span className="italic text-[var(--color-brand)]">explications.</span>
          </h1>
          <p className="mt-5 text-[var(--color-ink-soft)] max-w-md leading-relaxed">
            MindKit est l&apos;atelier de cartes heuristiques pensé pour la classe.
            Construisez la connaissance avec vos élèves, déployez-la en un clic,
            partagez-la par lien.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-[var(--color-ink-soft)]">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)]" />
              Édition collaborative au rythme du cours
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
              Partage en lecture seule pour vos élèves
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-leaf)]" />
              Import depuis vos notes Markdown
            </li>
          </ul>
        </section>

        <section className="paper-card p-8 fade-up" style={{ animationDelay: "120ms" }}>
          {!configured && (
            <div className="mb-4 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3 text-sm text-[var(--color-ink)]">
              Firebase n&apos;est pas encore configuré. Renseignez les variables{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_FIREBASE_*</code> dans{" "}
              <code className="font-mono text-xs">.env.local</code>.
            </div>
          )}

          <h2 className="font-display text-2xl">
            {mode === "signin" ? "Se connecter" : "Créer un compte"}
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] mt-1">
            {mode === "signin" ? "Reprenez où vous en étiez." : "Quelques secondes suffisent."}
          </p>

          <button
            onClick={google}
            disabled={!configured || busy}
            className="btn btn-ghost w-full justify-center mt-6 !py-2.5"
          >
            <GoogleIcon /> Continuer avec Google
          </button>

          <div className="flex items-center gap-3 my-5 text-xs text-[var(--color-ink-muted)]">
            <div className="h-px bg-[var(--color-line)] flex-1" />
            ou
            <div className="h-px bg-[var(--color-line)] flex-1" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-soft)]">Adresse e-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mt-1"
                placeholder="vous@ecole.be"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-soft)]">Mot de passe</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1"
                placeholder="••••••••"
              />
            </label>
            {error && (
              <p className="text-sm text-[#a63a1f]">{error}</p>
            )}
            <button
              type="submit"
              disabled={!configured || busy}
              className="btn btn-primary w-full justify-center !py-2.5"
            >
              {mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-ink-soft)]">
            {mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
            <button
              type="button"
              className="text-[var(--color-brand)] underline underline-offset-2 font-medium"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.96l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

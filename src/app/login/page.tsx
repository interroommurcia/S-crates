"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function loginPasskey() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const optRes = await fetch("/api/auth/passkey/login/options", { method: "POST" });
      const options = await optRes.json();
      const credential = await startAuthentication({ optionsJSON: options });
      const verRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (verRes.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const d = await verRes.json().catch(() => ({}));
        setError(d.error ?? "No se pudo entrar con passkey");
      }
    } catch {
      setError("Passkey cancelado o no disponible");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Error");
        setPassword("");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white px-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl font-bold mb-6">
        S
      </div>
      <h1 className="text-xl font-semibold mb-1">Sócrates</h1>
      <p className="text-sm text-neutral-400 mb-8">Acceso privado</p>

      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition-colors"
        />
        {error && <p className="text-rose-400 text-xs text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <div className="flex items-center gap-3 my-1">
          <div className="h-px bg-neutral-800 flex-1" />
          <span className="text-xs text-neutral-600">o</span>
          <div className="h-px bg-neutral-800 flex-1" />
        </div>

        <button
          type="button"
          onClick={loginPasskey}
          disabled={loading}
          className="border border-neutral-700 hover:border-amber-500 text-neutral-200 rounded-xl px-5 py-3 text-sm font-medium transition-colors disabled:opacity-40"
        >
          Entrar con passkey (Face ID / huella)
        </button>
      </form>
    </main>
  );
}

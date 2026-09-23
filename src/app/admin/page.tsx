"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Protocol = { id: string; title: string; created_at: string; chunks: number };
type Fact = {
  id: string;
  content: string;
  category: string;
  importance: number;
  source: string;
  created_at: string;
};

export default function Admin() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([
      fetch("/api/admin/protocols").then((r) => r.json()),
      fetch("/api/admin/facts").then((r) => r.json()),
    ]);
    setProtocols(Array.isArray(p) ? p : []);
    setFacts(Array.isArray(f) ? f : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadProtocol(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Guardado (${data.chunks} fragmentos)`);
        setTitle("");
        setContent("");
        load();
      } else {
        setMsg(data.error ?? "Error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function delProtocol(id: string) {
    if (!confirm("¿Borrar este protocolo?")) return;
    await fetch("/api/admin/protocols", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function delFact(id: string) {
    await fetch("/api/admin/facts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
        <Link
          href="/"
          className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold"
        >
          S
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="text-xs text-neutral-400">Protocolos y memoria de Sócrates</p>
        </div>
        <nav className="ml-auto flex gap-4 text-sm text-neutral-400">
          <Link href="/" className="hover:text-amber-500">Chat</Link>
          <Link href="/finanzas" className="hover:text-amber-500">Finanzas</Link>
        </nav>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">Subir protocolo</h2>
          <form onSubmit={uploadProtocol} className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título (ej: Protocolo de captación de inmuebles)"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Pega aquí el contenido del protocolo, o carga un archivo .txt/.md abajo."
              rows={8}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain"
                onChange={onFile}
                className="text-xs text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
              />
              <button
                type="submit"
                disabled={saving || !title.trim() || !content.trim()}
                className="ml-auto bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium"
              >
                {saving ? "Guardando…" : "Guardar protocolo"}
              </button>
            </div>
            {msg && <p className="text-xs text-amber-400">{msg}</p>}
          </form>
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">
            Protocolos ({protocols.length})
          </h2>
          {protocols.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aún no hay protocolos.</p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {protocols.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.title}</p>
                    <p className="text-xs text-neutral-500">
                      {p.chunks} fragmentos · {p.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <button
                    onClick={() => delProtocol(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">
            Memoria — lo que Sócrates sabe de ti ({facts.length})
          </h2>
          {facts.length === 0 ? (
            <p className="text-neutral-500 text-sm">Sin datos guardados todavía.</p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {facts.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-2.5 group">
                  <span className="text-xs text-neutral-500 w-24 shrink-0 capitalize">
                    {f.category}
                  </span>
                  <p className="text-sm flex-1 min-w-0">{f.content}</p>
                  <span className="text-xs text-neutral-600" title="importancia">
                    {"★".repeat(f.importance)}
                  </span>
                  <button
                    onClick={() => delFact(f.id)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

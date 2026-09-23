"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { startRegistration } from "@simplewebauthn/browser";

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

  type ImportRow = {
    occurred_at: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    category: string;
    subcategory: string | null;
  };
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([
        fetch("/api/admin/protocols").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/admin/facts").then((r) => (r.ok ? r.json() : [])),
      ]);
      setProtocols(Array.isArray(p) ? p : []);
      setFacts(Array.isArray(f) ? f : []);
    } catch {
      /* red: conserva datos previos */
    }
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

  async function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("Analizando y categorizando…");
    setImportRows(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportRows(data.rows ?? []);
        setImportMsg(`${data.rows?.length ?? 0} movimientos detectados. Revisa y confirma.`);
      } else {
        setImportMsg(data.error ?? "Error");
      }
    } catch {
      setImportMsg("Error leyendo el archivo");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function confirmImport() {
    if (!importRows || importRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows, commit: true }),
      });
      const data = await res.json();
      setImportMsg(res.ok ? `${data.inserted} movimientos importados ✓` : (data.error ?? "Error"));
      if (res.ok) setImportRows(null);
    } finally {
      setImporting(false);
    }
  }

  async function addPasskey() {
    try {
      const opt = await (
        await fetch("/api/auth/passkey/register/options", { method: "POST" })
      ).json();
      const credential = await startRegistration({ optionsJSON: opt });
      const res = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      alert(res.ok ? "Passkey añadido. Ya puedes entrar con Face ID/huella." : "No se pudo añadir el passkey.");
    } catch {
      alert("Registro de passkey cancelado o no disponible en este dispositivo.");
    }
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
          <h2 className="text-sm font-semibold text-neutral-300 mb-2">
            Importar CSV del banco
          </h2>
          <p className="text-xs text-neutral-500 mb-4">
            Exporta el CSV de tu banco y súbelo. Sócrates detecta las columnas y
            categoriza cada movimiento. Revisa antes de confirmar.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onCsvFile}
            disabled={importing}
            className="text-xs text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
          />
          {importMsg && <p className="text-xs text-amber-400 mt-3">{importMsg}</p>}

          {importRows && importRows.length > 0 && (
            <div className="mt-4">
              <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-950 text-neutral-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">Fecha</th>
                      <th className="text-left px-2 py-1.5">Concepto</th>
                      <th className="text-left px-2 py-1.5">Categoría</th>
                      <th className="text-right px-2 py-1.5">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {importRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{r.occurred_at}</td>
                        <td className="px-2 py-1.5 truncate max-w-[180px]">{r.description}</td>
                        <td className="px-2 py-1.5 text-neutral-400">
                          {r.category}
                          {r.subcategory ? <span className="text-neutral-600"> · {r.subcategory}</span> : null}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${r.type === "income" ? "text-emerald-400" : "text-rose-400"}`}>
                          {r.type === "income" ? "+" : "−"}{r.amount.toFixed(2)}€
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={confirmImport}
                disabled={importing}
                className="mt-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium"
              >
                {importing ? "Importando…" : `Confirmar importación (${importRows.length})`}
              </button>
            </div>
          )}
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

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-2">Seguridad</h2>
          <p className="text-xs text-neutral-500 mb-4">
            Añade un passkey para entrar con Face ID o huella en este dispositivo,
            sin escribir la contraseña. La contraseña sigue funcionando como respaldo.
          </p>
          <button
            onClick={addPasskey}
            className="border border-neutral-700 hover:border-amber-500 text-neutral-200 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Añadir passkey en este dispositivo
          </button>
        </section>
      </div>
    </main>
  );
}

"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

function genId() {
  return crypto.randomUUID();
}

// Formateo ligero (solo estetica): negritas, codigo inline, titulos, listas y
// separadores, sin dependencias externas ni HTML sin sanear.
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {m[2]}
        </strong>
      );
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-black/30 px-1.5 py-0.5 text-[13px] font-mono text-amber-200"
        >
          {m[3]}
        </code>
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let key = 0;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, j) => (
      <li key={j} className="marker:text-neutral-500">
        {renderInline(it)}
      </li>
    ));
    blocks.push(
      list.type === "ol" ? (
        <ol key={key++} className="list-decimal space-y-1 pl-5 my-2">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="list-disc space-y-1 pl-5 my-2">
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flush();
      blocks.push(<hr key={key++} className="border-white/10 my-3" />);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push(
        <p
          key={key++}
          className={`font-semibold text-white mt-3 mb-1 ${
            h[1].length === 1 ? "text-lg" : "text-[15px]"
          }`}
        >
          {renderInline(h[2])}
        </p>
      );
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    flush();
    blocks.push(
      <p key={key++} className="my-1.5">
        {renderInline(line)}
      </p>
    );
  }
  flush();
  return <>{blocks}</>;
}

type Project = { id: string; name: string; conversations: number };
type ConvMeta = {
  id: string;
  title: string | null;
  project_id: string | null;
  updated_at: string;
};
type Doc = {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  chunks: number;
  status: string;
  created_at: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [convId, setConvId] = useState(genId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [convsByProject, setConvsByProject] = useState<Record<string, ConvMeta[]>>({});
  const [filesFor, setFilesFor] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const reflectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titledRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadProjects = () => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const loadConvs = (pid: string) => {
    fetch(`/api/conversations?project=${pid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) =>
        setConvsByProject((prev) => ({ ...prev, [pid]: Array.isArray(d) ? d : [] }))
      )
      .catch(() => {});
  };

  // Carga inicial desde la URL: ?c=<conv> reabre una conversacion,
  // ?p=<proyecto> arranca una nueva dentro de ese proyecto.
  useEffect(() => {
    loadProjects();
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    const p = params.get("p");
    (async () => {
      if (c && /^[0-9a-f-]{36}$/i.test(c)) {
        const d = await fetch(`/api/conversations?id=${c}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!d) return;
        setConvId(d.id);
        setProjectId(d.project_id ?? null);
        setMessages(Array.isArray(d.messages) ? d.messages : []);
        titledRef.current = true;
      } else if (p && /^[0-9a-f-]{36}$/i.test(p)) {
        await Promise.resolve();
        setProjectId(p);
      }
    })();
  }, []);

  const openConversation = (c: ConvMeta) => {
    setConvId(c.id);
    setProjectId(c.project_id ?? null);
    titledRef.current = true;
    setSidebarOpen(false);
    fetch(`/api/conversations?id=${c.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMessages(d && Array.isArray(d.messages) ? d.messages : []))
      .catch(() => {});
    window.history.pushState({}, "", `/?c=${c.id}`);
  };

  const newConversation = (pid: string) => {
    setConvId(genId());
    setProjectId(pid);
    setMessages([]);
    setInput("");
    titledRef.current = false;
    setSidebarOpen(false);
    window.history.pushState({}, "", `/?p=${pid}`);
  };

  const createProject = async () => {
    const name = window.prompt("Nombre del proyecto")?.trim();
    if (!name) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const proj = (await res.json()) as Project;
      loadProjects();
      newConversation(proj.id);
    }
  };

  const toggleProject = (pid: string) => {
    setExpanded((cur) => {
      const next = cur === pid ? null : pid;
      if (next && !convsByProject[pid]) loadConvs(pid);
      return next;
    });
  };

  const openFiles = (p: Project) => {
    setFilesFor(p);
    setUploadMsg("");
    setDocsLoading(true);
    fetch(`/api/documents?project=${p.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !filesFor || uploading) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      setUploadMsg(`Procesando ${file.name}…`);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", filesFor.id);
      try {
        const res = await fetch("/api/documents", { method: "POST", body: fd });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          setUploadMsg(`${file.name}: ${e.error ?? "error"}`);
          continue;
        }
        const doc = (await res.json()) as Doc;
        setDocs((prev) => [doc, ...prev]);
      } catch {
        setUploadMsg(`${file.name}: error de conexión`);
      }
    }
    setUploading(false);
    setUploadMsg((m) => (m.startsWith("Procesando") ? "" : m));
    loadProjects();
  };

  const deleteDoc = async (id: string) => {
    if (!window.confirm("¿Borrar este documento?")) return;
    const res = await fetch("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== id));
      loadProjects();
    }
  };

  const flushReflect = (keepalive = false) => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    if (reflectTimerRef.current) clearTimeout(reflectTimerRef.current);
    fetch("/api/reflect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId }),
      keepalive,
    }).catch(() => {});
  };

  const scheduleReflect = () => {
    dirtyRef.current = true;
    if (reflectTimerRef.current) clearTimeout(reflectTimerRef.current);
    reflectTimerRef.current = setTimeout(() => flushReflect(false), 45000);
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushReflect(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, conversationId: convId, projectId }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let assistant = "";
      let buffer = "";
      setStatus("");
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Extrae los marcadores de estado \u0000S:...\u0000 (muletillas) y deja
        // el resto como texto real de la respuesta.
        let text = "";
        while (true) {
          const start = buffer.indexOf("\u0000");
          if (start === -1) {
            text += buffer;
            buffer = "";
            break;
          }
          text += buffer.slice(0, start);
          const end = buffer.indexOf("\u0000", start + 1);
          if (end === -1) {
            buffer = buffer.slice(start); // marcador incompleto, espera mas
            break;
          }
          const payload = buffer.slice(start + 1, end);
          if (payload.startsWith("S:")) setStatus(payload.slice(2));
          buffer = buffer.slice(end + 1);
        }

        if (text) {
          assistant += text;
          setStatus("");
          const current = assistant;
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: current },
          ]);
        }
      }

      setStatus("");
      scheduleReflect();

      // Primera respuesta de una conversacion de proyecto: fija la URL y
      // refresca la lista del proyecto para que aparezca al momento.
      if (projectId && !titledRef.current) {
        titledRef.current = true;
        window.history.replaceState({}, "", `/?c=${convId}`);
        loadConvs(projectId);
        loadProjects();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  const activeProject = projects.find((p) => p.id === projectId);

  return (
    <main className="flex flex-col h-[100dvh] bg-neutral-950 text-white">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-neutral-900 border-r border-neutral-800 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <span className="text-sm font-semibold">Proyectos</span>
          <button
            onClick={createProject}
            className="text-xs rounded-md bg-amber-600 hover:bg-amber-500 px-2 py-1 transition-colors"
          >
            + Nuevo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {projects.length === 0 && (
            <p className="text-xs text-neutral-500 px-2 py-3">
              Aún no hay proyectos. Crea uno con “+ Nuevo”.
            </p>
          )}
          {projects.map((p) => (
            <div key={p.id}>
              <button
                onClick={() => toggleProject(p.id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-800 transition-colors ${
                  projectId === p.id ? "text-amber-400" : "text-neutral-200"
                }`}
              >
                <span className="text-neutral-500 text-xs w-3">
                  {expanded === p.id ? "▾" : "▸"}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-neutral-500">{p.conversations}</span>
              </button>
              {expanded === p.id && (
                <div className="pl-5 pr-1 py-1 space-y-0.5">
                  <button
                    onClick={() => newConversation(p.id)}
                    className="w-full text-left text-xs text-amber-400/90 hover:text-amber-300 px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors"
                  >
                    + Nueva conversación
                  </button>
                  <button
                    onClick={() => openFiles(p)}
                    className="w-full text-left text-xs text-neutral-400 hover:text-white px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors"
                  >
                    📎 Archivos
                  </button>
                  {(convsByProject[p.id] ?? []).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openConversation(c)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors truncate ${
                        convId === c.id ? "bg-neutral-800 text-white" : "text-neutral-300"
                      }`}
                    >
                      {c.title || "Sin título"}
                    </button>
                  ))}
                  {(convsByProject[p.id]?.length ?? 0) === 0 && (
                    <p className="text-[11px] text-neutral-600 px-2 py-1">
                      Sin conversaciones.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {filesFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !uploading && setFilesFor(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-neutral-900 border border-neutral-700 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold truncate">Archivos · {filesFor.name}</h2>
                <p className="text-xs text-neutral-500">
                  Todas las conversaciones del proyecto los consultan.
                </p>
              </div>
              <button
                onClick={() => !uploading && setFilesFor(null)}
                className="text-neutral-500 hover:text-white text-lg leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 border-b border-neutral-800">
              <label
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-600 py-6 text-center text-sm cursor-pointer hover:border-amber-500 transition-colors ${
                  uploading ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                <span className="text-neutral-300">
                  {uploading ? "Subiendo…" : "Haz clic para subir documentos"}
                </span>
                <span className="text-xs text-neutral-500">
                  PDF, Word, texto o imagen · máx. 10 MB
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => uploadFiles(e.target.files)}
                />
              </label>
              {uploadMsg && (
                <p className="mt-2 text-xs text-amber-400">{uploadMsg}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {docsLoading && <p className="text-xs text-neutral-500">Cargando…</p>}
              {!docsLoading && docs.length === 0 && (
                <p className="text-xs text-neutral-500 py-4 text-center">
                  Aún no hay documentos en este proyecto.
                </p>
              )}
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg bg-neutral-800/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{d.name}</p>
                    <p className="text-[11px] text-neutral-500">
                      {d.kind} · {d.chunks} fragmentos · {(d.bytes / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => deleteDoc(d.id)}
                    className="text-xs text-neutral-500 hover:text-rose-400 transition-colors shrink-0"
                  >
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Proyectos"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-300 shrink-0"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="block w-4 h-0.5 bg-current" />
            <span className="block w-4 h-0.5 bg-current" />
            <span className="block w-4 h-0.5 bg-current" />
          </span>
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-base font-bold shrink-0">
          S
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Sócrates</h1>
          <p className="text-xs text-neutral-400 leading-tight truncate">
            {activeProject ? activeProject.name : "Tu asistente personal"}
          </p>
        </div>
        <Link
          href="/finanzas"
          className="ml-auto text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          Finanzas
        </Link>
        <Link
          href="/calendario"
          className="text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          Calendario
        </Link>
        <Link
          href="/admin"
          className="text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          Admin
        </Link>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="text-sm text-neutral-500 hover:text-rose-400 transition-colors"
        >
          Salir
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-5 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center text-4xl">
              S
            </div>
            <p className="text-center max-w-md">
              Soy Sócrates, tu asistente personal. Cuéntame lo que necesites:
              finanzas, organización, ideas, o simplemente hablar.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 text-[15px] leading-7 ${
                m.role === "user"
                  ? "rounded-2xl rounded-br-md bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm whitespace-pre-wrap"
                  : "rounded-2xl rounded-bl-md bg-neutral-800/70 border border-white/5 text-neutral-200 shadow-sm backdrop-blur-sm"
              }`}
            >
              {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
              {m.role === "assistant" &&
                i === messages.length - 1 &&
                loading &&
                (status || !m.content) && (
                  <span
                    className={`text-xs text-neutral-400 italic animate-pulse ${
                      m.content ? "block mt-2" : ""
                    }`}
                  >
                    {status || "Mmmmmm.."}
                  </span>
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 px-4 py-4 shrink-0 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-3 max-w-3xl mx-auto"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe a Sócrates..."
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
          >
            Enviar
          </button>
        </form>
      </div>
    </main>
  );
}

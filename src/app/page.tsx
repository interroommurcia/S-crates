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

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [convId] = useState(genId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const reflectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ messages: updated, conversationId: convId }),
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

  return (
    <main className="flex flex-col h-[100dvh] bg-neutral-950 text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-base font-bold shrink-0">
          S
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Sócrates</h1>
          <p className="text-xs text-neutral-400 leading-tight">Tu asistente personal</p>
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

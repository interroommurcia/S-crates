"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { startRegistration } from "@simplewebauthn/browser";

type Msg = { role: "user" | "assistant"; content: string };

function genId() {
  return crypto.randomUUID();
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistant += decoder.decode(value, { stream: true });
        const current = assistant;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: current },
        ]);
      }

      scheduleReflect();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col h-screen bg-neutral-950 text-white">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold">
          S
        </div>
        <div>
          <h1 className="text-lg font-semibold">Sócrates</h1>
          <p className="text-xs text-neutral-400">Tu asistente personal</p>
        </div>
        <Link
          href="/finanzas"
          className="ml-auto text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          Finanzas
        </Link>
        <Link
          href="/admin"
          className="text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          Admin
        </Link>
        <button
          onClick={async () => {
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
              alert(res.ok ? "Passkey añadido correctamente." : "No se pudo añadir el passkey.");
            } catch {
              alert("Registro de passkey cancelado o no disponible.");
            }
          }}
          className="text-sm text-neutral-400 hover:text-amber-500 transition-colors"
        >
          + Passkey
        </button>
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

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
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
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-amber-600 text-white"
                  : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {m.content}
              {m.role === "assistant" && !m.content && (
                <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse rounded-sm" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 px-4 py-4">
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

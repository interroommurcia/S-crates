"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";

type Kind = "task" | "meeting";

type Ev = {
  id: string;
  kind: Kind;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// Desplaza un "YYYY-MM" n meses.
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Clave local YYYY-MM-DD de un timestamp ISO.
function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function Calendario() {
  const [month, setMonth] = useState(currentMonth);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formDay, setFormDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar");
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      /* red: conserva datos */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("¿Borrar este evento?")) return;
    await fetch("/api/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const byDay = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of events) (m[dayKey(e.starts_at)] ??= []).push(e);
    return m;
  }, [events]);

  // Celdas del mes: relleno hasta lunes inicial y hasta completar semanas.
  const cells = useMemo(() => {
    const [y, mo] = month.split("-").map(Number);
    const first = new Date(y, mo - 1, 1);
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(y, mo, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return { y, mo, arr };
  }, [month]);

  const todayKey = dayKey(new Date().toISOString());

  const upcoming = events; // ya vienen ordenados por inicio

  function openForm(day?: string) {
    setFormDay(day ?? null);
    setShowForm(true);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold"
          >
            S
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Calendario</h1>
            <p className="text-xs text-neutral-400">Tareas y reuniones</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mes anterior"
            className="w-9 h-9 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
          >
            ‹
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Mes siguiente"
            className="w-9 h-9 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
          >
            ›
          </button>
          {month !== currentMonth() && (
            <button
              onClick={() => setMonth(currentMonth())}
              className="ml-1 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-3 h-9 text-xs text-neutral-300"
            >
              Hoy
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Los eventos se borran solos al finalizar.
          </p>
          <button
            onClick={() => openForm()}
            className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium transition-colors"
          >
            + Añadir
          </button>
        </div>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-3 sm:p-5">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-xs text-neutral-500 py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.arr.map((d, i) => {
              if (d === null) return <div key={i} />;
              const key = `${cells.y}-${String(cells.mo).padStart(2, "0")}-${String(d).padStart(
                2,
                "0"
              )}`;
              const evs = byDay[key] ?? [];
              const isToday = key === todayKey;
              return (
                <button
                  key={i}
                  onClick={() => openForm(key)}
                  className={`min-h-[68px] sm:min-h-[84px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                    isToday
                      ? "border-amber-600 bg-neutral-800/60"
                      : "border-neutral-800 hover:bg-neutral-800/40"
                  }`}
                >
                  <div className={`text-xs mb-1 ${isToday ? "text-amber-400 font-semibold" : "text-neutral-400"}`}>
                    {d}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                          e.kind === "meeting"
                            ? "bg-sky-500/20 text-sky-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                        title={e.title}
                      >
                        {timeFmt(e.starts_at)} {e.title}
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <div className="text-[10px] text-neutral-500">+{evs.length - 3}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-4 justify-center mt-3 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block bg-emerald-500/60" />
              Tareas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block bg-sky-500/60" />
              Reuniones
            </span>
          </div>
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">
            Próximos ({upcoming.length})
          </h2>
          {upcoming.length === 0 && !loading ? (
            <p className="text-neutral-500 text-sm">Nada pendiente. Añade una tarea o reunión.</p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {upcoming.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-3 group">
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${
                      e.kind === "meeting" ? "bg-sky-400" : "bg-emerald-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {e.title}
                      {e.location ? (
                        <span className="text-neutral-500"> · {e.location}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {dateFmt(e.starts_at)} · {timeFmt(e.starts_at)}
                      {e.ends_at ? `–${timeFmt(e.ends_at)}` : ""}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 transition text-xs"
                    aria-label="Borrar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <NewEventForm
          defaultDay={formDay}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </main>
  );
}

function NewEventForm({
  defaultDay,
  onClose,
  onSaved,
}: {
  defaultDay: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const base = defaultDay ?? new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(`${base}T09:00`);
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Escribe un título.");
      return;
    }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError("El fin debe ser posterior al inicio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          starts_at: startsAt,
          ends_at: endsAt || undefined,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return;
      }
      onSaved();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full sm:max-w-md bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo evento</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["task", "meeting"] as const).map((k) => {
            const active = k === "meeting" ? "bg-sky-600" : "bg-emerald-600";
            const label = k === "meeting" ? "Reunión" : "Tarea";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  kind === k ? `${active} text-white` : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className="text-xs text-neutral-400">Título</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "meeting" ? "Reunión con…" : "Tarea…"}
            autoFocus
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-neutral-400">Inicio</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-400">Fin (opcional)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>

        {kind === "meeting" && (
          <label className="block">
            <span className="text-xs text-neutral-400">Lugar</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="opcional"
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs text-neutral-400">Notas</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="opcional"
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : "Guardar evento"}
        </button>
      </form>
    </div>
  );
}

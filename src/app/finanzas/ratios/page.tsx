"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Ratios = {
  period: { from: string; to: string };
  total_personal: number;
  debt: { name: string; initial: number; paid: number; remaining: number; progress: number } | null;
  fund: { name: string; base: number; contributed: number; total: number } | null;
  assets: number;
  debt_ratio: number | null;
  month: {
    income: number;
    estilo_vida: number;
    ahorro: number;
    savings_rate: number | null;
    lifestyle_rate: number | null;
  };
};

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function RatiosPage() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Ratios | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/ratios?month=${month}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function editBase(current: number) {
    const raw = prompt("Saldo de partida del fondo de ahorro (€):", String(current));
    if (raw == null) return;
    const base = Number(raw.replace(",", "."));
    if (!(base >= 0)) return;
    await fetch("/api/finance/fund", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_amount: base }),
    }).catch(() => {});
    load();
  }

  const d = data?.debt;
  const f = data?.fund;
  const m = data?.month;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  const monthName = monthLabel.split(" de ")[0];

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/finanzas"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold"
          >
            S
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Ratios</h1>
            <p className="text-xs text-neutral-400">Cuenta personal · {monthLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/finanzas" className="text-sm text-neutral-400 hover:text-amber-500 transition-colors">
            ← Finanzas
          </Link>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && !data ? (
          <p className="text-neutral-500 text-sm">Calculando…</p>
        ) : !data ? (
          <p className="text-neutral-500 text-sm">
            No se pudieron cargar los ratios. ¿Está ejecutada la migración v20 en Supabase?
          </p>
        ) : (
          <>
            {/* Patrimonio y total */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
                <p className="text-sm text-neutral-400 mb-1">Total cuenta personal</p>
                <p
                  className={`text-4xl font-bold tabular-nums ${
                    data.total_personal >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {eur(data.total_personal)}
                </p>
                <p className="text-xs text-neutral-500 mt-2">
                  Acumulado: ingresos − gastos − impuestos.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
                <p className="text-sm text-neutral-400 mb-1">Patrimonio (personal + ahorro)</p>
                <p className="text-4xl font-bold tabular-nums text-sky-400">{eur(data.assets)}</p>
                <p className="text-xs text-neutral-500 mt-2">
                  {eur(data.total_personal)} + {eur(f?.total ?? 0)} de ahorro.
                </p>
              </div>
            </section>

            {/* Ratio de endeudamiento — destacado */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-300">Ratio de endeudamiento</h2>
                <p
                  className={`text-4xl font-bold tabular-nums ${
                    data.debt_ratio == null
                      ? "text-neutral-500"
                      : data.debt_ratio < 0.3
                      ? "text-emerald-400"
                      : data.debt_ratio < 0.6
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {pct(data.debt_ratio)}
                </p>
              </div>
              <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    data.debt_ratio == null
                      ? ""
                      : data.debt_ratio < 0.3
                      ? "bg-emerald-500"
                      : data.debt_ratio < 0.6
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.round((data.debt_ratio ?? 0) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Deuda pendiente {eur(d?.remaining ?? 0)} ÷ patrimonio {eur(data.assets)}. Cuanto más
                bajo, mejor.
              </p>
            </section>

            {/* Deuda */}
            {d && (
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-300">{d.name}</h2>
                  <p className="text-3xl font-bold tabular-nums text-rose-400">{eur(d.remaining)}</p>
                </div>
                <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                    style={{ width: `${Math.round(d.progress * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>
                    Amortizado {eur(d.paid)} ({pct(d.progress)})
                  </span>
                  <span>Inicial {eur(d.initial)}</span>
                </div>
              </section>
            )}

            {/* Fondo de ahorro */}
            {f && (
              <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-300">{f.name}</h2>
                  <p className="text-3xl font-bold tabular-nums text-emerald-400">{eur(f.total)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    Base {eur(f.base)}
                    {f.contributed >= 0
                      ? ` + aportado ${eur(f.contributed)}`
                      : ` − retirado ${eur(-f.contributed)}`}
                  </span>
                  <button
                    onClick={() => editBase(f.base)}
                    className="text-neutral-400 hover:text-amber-400 transition-colors underline"
                  >
                    Ajustar base
                  </button>
                </div>
              </section>
            )}

            {/* Ratios del mes */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RatioCard
                label={`Tasa de ahorro · ${monthName}`}
                pct={pct(m?.savings_rate)}
                sub={`${eur(m?.ahorro ?? 0)} ahorrado de ${eur(m?.income ?? 0)} de ingresos`}
                accent="text-emerald-400"
                fill={m?.savings_rate ?? 0}
                fillColor="from-emerald-500 to-emerald-400"
              />
              <RatioCard
                label={`Estilo de vida · ${monthName}`}
                pct={pct(m?.lifestyle_rate)}
                sub={`${eur(m?.estilo_vida ?? 0)} de ${eur(m?.income ?? 0)} de ingresos`}
                accent="text-violet-300"
                fill={m?.lifestyle_rate ?? 0}
                fillColor="from-violet-500 to-fuchsia-400"
              />
            </section>

            <p className="text-xs text-neutral-500">
              Las tasas del mes se calculan sobre tus ingresos personales de {monthName}. Etiqueta
              cada movimiento con su apartado (Estilo de vida, Ahorro o Deuda) al añadirlo o editarlo
              para que entre aquí.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function RatioCard({
  label,
  pct,
  sub,
  accent,
  fill,
  fillColor,
}: {
  label: string;
  pct: string;
  sub: string;
  accent: string;
  fill: number;
  fillColor: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <p className="text-sm text-neutral-400 mb-1">{label}</p>
      <p className={`text-4xl font-bold tabular-nums ${accent}`}>{pct}</p>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden my-3">
        <div
          className={`h-full bg-gradient-to-r ${fillColor} rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500">{sub}</p>
    </div>
  );
}

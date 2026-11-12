"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Ratios = {
  period: { from: string; to: string };
  total_personal: number;
  debt: { name: string; initial: number; paid: number; remaining: number; progress: number } | null;
  fund: { name: string; base: number; contributed: number; total: number } | null;
  assets: number;
  extras: { id: string; label: string; amount: number }[];
  total_debt: number;
  debt_ratio: number | null;
  scope: "global" | "month";
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
  const [scope, setScope] = useState<"global" | "month">("global");
  const [data, setData] = useState<Ratios | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/ratios?scope=${scope}&month=${month}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [month, scope]);

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

  async function saveExtra(id: string, amount: number) {
    await fetch("/api/finance/extra-debts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, amount }),
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
  const rateScope = scope === "global" ? "global" : monthName;

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
            <p className="text-xs text-neutral-400">
              Cuenta personal · {scope === "global" ? "global" : monthLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
            {(["global", "month"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  scope === s ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {s === "global" ? "Global" : "Mes"}
              </button>
            ))}
          </div>
          {scope === "month" && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          )}
          <Link href="/finanzas" className="text-sm text-neutral-400 hover:text-amber-500 transition-colors">
            ← Finanzas
          </Link>
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
                Deuda total {eur(data.total_debt)} ÷ patrimonio {eur(data.assets)}. Cuanto más bajo,
                mejor.
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
                label={`Tasa de ahorro · ${rateScope}`}
                pct={pct(m?.savings_rate)}
                sub={`${eur(m?.ahorro ?? 0)} ahorrado de ${eur(m?.income ?? 0)} de ingresos`}
                accent="text-emerald-400"
                fill={m?.savings_rate ?? 0}
                fillColor="from-emerald-500 to-emerald-400"
              />
              <RatioCard
                label={`Estilo de vida · ${rateScope}`}
                pct={pct(m?.lifestyle_rate)}
                sub={`${eur(m?.estilo_vida ?? 0)} de ${eur(m?.income ?? 0)} de ingresos`}
                accent="text-violet-300"
                fill={m?.lifestyle_rate ?? 0}
                fillColor="from-violet-500 to-fuchsia-400"
              />
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
              <h2 className="text-sm font-semibold text-neutral-300 mb-1">Ajustes C y P</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Restan de la deuda del ratio de endeudamiento, pero no tocan el patrimonio.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {data.extras.map((e) => (
                  <ExtraBox key={e.id} label={e.label} amount={e.amount} onSave={(v) => saveExtra(e.id, v)} />
                ))}
              </div>
            </section>

            <p className="text-xs text-neutral-500">
              {scope === "global"
                ? "Las tasas se calculan sobre todos tus ingresos personales registrados."
                : `Las tasas se calculan sobre tus ingresos personales de ${monthName}.`}{" "}
              Etiqueta cada movimiento con su apartado (Estilo de vida, Ahorro o Deuda) al añadirlo o
              editarlo para que entre aquí.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function ExtraBox({
  label,
  amount,
  onSave,
}: {
  label: string;
  amount: number;
  onSave: (v: number) => void;
}) {
  const [val, setVal] = useState(String(amount).replace(".", ","));

  // Refleja cambios externos (recarga) cuando no se está editando.
  useEffect(() => {
    setVal(String(amount).replace(".", ","));
  }, [amount]);

  function commit() {
    const n = Number(val.replace(",", "."));
    if (!(n >= 0)) {
      setVal(String(amount).replace(".", ","));
      return;
    }
    if (n !== amount) onSave(n);
  }

  return (
    <label className="block rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <span className="text-sm text-neutral-400">{label}</span>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full bg-transparent text-3xl font-bold tabular-nums text-emerald-400 focus:outline-none"
        />
        <span className="text-xl text-neutral-500">€</span>
      </div>
    </label>
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

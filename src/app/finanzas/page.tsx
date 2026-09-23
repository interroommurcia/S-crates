"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Tx = {
  id: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  description: string | null;
  account: string;
  occurred_at: string;
};

type SeriesPoint = { month: string; income: number; expense: number };

type Report = {
  period: { from: string; to: string };
  income: number;
  expense: number;
  balance: number;
  transaction_count: number;
  expenses_by_category: { category: string; amount: number }[];
};

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function Finanzas() {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance?month=${month}`);
      if (!res.ok) return; // 500 transitorio: conserva datos previos
      const data = await res.json();
      setReport(data.report);
      setTxs(data.transactions ?? []);
      setSeries(data.series ?? []);
    } catch {
      /* red: conserva datos previos */
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("¿Borrar este movimiento?")) return;
    await fetch("/api/finance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const maxCat = report?.expenses_by_category[0]?.amount ?? 0;

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
            <h1 className="text-lg font-semibold">Finanzas</h1>
            <p className="text-xs text-neutral-400">Contabilidad personal</p>
          </div>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
        />
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Ingresos" value={report?.income ?? 0} accent="text-emerald-400" />
          <Card label="Gastos" value={report?.expense ?? 0} accent="text-rose-400" />
          <Card
            label="Balance"
            value={report?.balance ?? 0}
            accent={(report?.balance ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">
            Ingresos vs gastos (últimos 6 meses)
          </h2>
          <MonthlyChart data={series} />
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">Gastos por categoría</h2>
          {loading ? (
            <p className="text-neutral-500 text-sm">Cargando…</p>
          ) : report && report.expenses_by_category.length > 0 ? (
            <div className="space-y-3">
              {report.expenses_by_category.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize text-neutral-300">{c.category}</span>
                    <span className="text-neutral-400">{eur(c.amount)}</span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full"
                      style={{ width: `${maxCat ? (c.amount / maxCat) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm">Sin gastos este mes.</p>
          )}
        </section>

        <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-4">
            Movimientos ({txs.length})
          </h2>
          {txs.length === 0 && !loading ? (
            <p className="text-neutral-500 text-sm">
              Sin movimientos. Registra gastos hablando con Sócrates: “gasté 40 en el super”.
            </p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {txs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="capitalize">{t.category}</span>
                      {t.subcategory ? (
                        <span className="text-neutral-500"> / {t.subcategory}</span>
                      ) : null}
                      {t.description ? (
                        <span className="text-neutral-400"> · {t.description}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t.occurred_at} · {t.account}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      t.type === "income" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {eur(t.amount)}
                  </span>
                  <button
                    onClick={() => remove(t.id)}
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
    </main>
  );
}

function MonthlyChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return <p className="text-neutral-500 text-sm">Sin datos.</p>;
  }
  const W = 620;
  const H = 180;
  const pad = { top: 10, bottom: 24, left: 8, right: 8 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const groupW = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(18, groupW / 3);
  const chartH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + chartH * (1 - v / max);

  const monthLabel = (m: string) => {
    const d = new Date(`${m}-01T00:00:00Z`);
    return d.toLocaleDateString("es-ES", { month: "short" });
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 420 }}>
        {data.map((d, i) => {
          const cx = pad.left + groupW * i + groupW / 2;
          return (
            <g key={d.month}>
              <rect
                x={cx - barW - 1}
                y={y(d.income)}
                width={barW}
                height={pad.top + chartH - y(d.income)}
                rx={2}
                fill="#34d399"
              />
              <rect
                x={cx + 1}
                y={y(d.expense)}
                width={barW}
                height={pad.top + chartH - y(d.expense)}
                rx={2}
                fill="#fb7185"
              />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#a3a3a3">
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 justify-center mt-2 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#34d399" }} />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#fb7185" }} />
          Gastos
        </span>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
      <p className="text-xs text-neutral-400 mb-1">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${accent}`}>{eur(value)}</p>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type TxType = "income" | "expense" | "tax";

type Tx = {
  id: string;
  amount: number;
  type: TxType;
  category: string;
  subcategory: string | null;
  description: string | null;
  account: string;
  receipt_path: string | null;
  occurred_at: string;
};

type Recurring = {
  id: string;
  amount: number;
  type: "expense" | "tax";
  category: string;
  subcategory: string | null;
  description: string | null;
  account: string;
  ledger: "personal" | "empresa";
  day_of_month: number;
};

type SeriesPoint = { month: string; income: number; expense: number; tax: number };

type Report = {
  period: { from: string; to: string };
  income: number;
  expense: number;
  tax: number;
  balance: number;
  transaction_count: number;
  expenses_by_category: { category: string; amount: number }[];
  taxes_by_category: { category: string; amount: number }[];
};

const EXPENSE_CATEGORIES = [
  "alimentacion", "restaurantes", "transporte", "vivienda", "suministros",
  "salud", "ocio", "ropa", "educacion", "viajes", "regalos",
  "suscripciones", "impuestos", "trabajo", "ahorro", "otros",
];
const INCOME_CATEGORIES = [
  "salario", "freelance", "ventas", "alquiler", "intereses", "regalo", "ahorro", "otros",
];
const TAX_CATEGORIES = [
  "iva", "irpf", "seguridad_social", "sociedades", "municipales", "otros",
];

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

type LedgerFilter = "conjunto" | "personal" | "empresa";

export default function Finanzas() {
  const [month, setMonth] = useState(currentMonth);
  const [ledger, setLedger] = useState<LedgerFilter>("personal");
  const [report, setReport] = useState<Report | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = ledger === "conjunto" ? "" : `&ledger=${ledger}`;
      const res = await fetch(`/api/finance?month=${month}${q}`);
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
  }, [month, ledger]);

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
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900 p-1">
            {(["personal", "empresa", "conjunto"] as LedgerFilter[]).map((l) => (
              <button
                key={l}
                onClick={() => setLedger(l)}
                className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  ledger === l
                    ? "bg-amber-600 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRecurring(true)}
              className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors"
            >
              Fijos
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium transition-colors"
            >
              + Añadir
            </button>
          </div>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card label="Ingresos" value={report?.income ?? 0} accent="text-emerald-400" />
          <Card label="Gastos" value={report?.expense ?? 0} accent="text-rose-400" />
          <Card label="Impuestos" value={report?.tax ?? 0} accent="text-amber-400" />
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

        {report && report.taxes_by_category.length > 0 && (
          <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
            <h2 className="text-sm font-semibold text-neutral-300 mb-4">Impuestos por categoría</h2>
            <div className="space-y-3">
              {report.taxes_by_category.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="uppercase text-neutral-300">{c.category.replace("_", " ")}</span>
                    <span className="text-neutral-400">{eur(c.amount)}</span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full"
                      style={{
                        width: `${
                          report.taxes_by_category[0].amount
                            ? (c.amount / report.taxes_by_category[0].amount) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
                      {t.receipt_path ? (
                        <>
                          {" · "}
                          <a
                            href={`/api/finance/receipt?path=${encodeURIComponent(t.receipt_path)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400 hover:underline"
                          >
                            📎 factura
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      t.type === "income"
                        ? "text-emerald-400"
                        : t.type === "tax"
                        ? "text-amber-400"
                        : "text-rose-400"
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

      {showForm && (
        <NewTxForm
          defaultLedger={ledger === "conjunto" ? "personal" : ledger}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {showRecurring && (
        <RecurringModal
          defaultLedger={ledger === "conjunto" ? "personal" : ledger}
          onClose={() => setShowRecurring(false)}
          onChanged={load}
        />
      )}
    </main>
  );
}

function NewTxForm({
  defaultLedger,
  onClose,
  onSaved,
}: {
  defaultLedger: "personal" | "empresa";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TxType>("expense");
  const [ledger, setLedger] = useState<"personal" | "empresa">(defaultLedger);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [account, setAccount] = useState("banco");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catsFor = (t: TxType) =>
    t === "expense" ? EXPENSE_CATEGORIES : t === "tax" ? TAX_CATEGORIES : INCOME_CATEGORIES;
  const cats = catsFor(type);

  function changeType(t: TxType) {
    setType(t);
    setCategory(catsFor(t)[0]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) {
      setError("Introduce un importe válido.");
      return;
    }
    if (file && file.type !== "application/pdf") {
      setError("La factura debe ser un PDF.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let receipt_path: string | undefined;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/finance/receipt", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) {
          setError(upData.error ?? "No se pudo subir el PDF.");
          return;
        }
        receipt_path = upData.path;
      }

      const res = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: value,
          type,
          ledger,
          category,
          subcategory: subcategory.trim() || undefined,
          description: description.trim() || undefined,
          account: account.trim() || undefined,
          date,
          receipt_path,
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
          <h2 className="text-lg font-semibold">Nuevo movimiento</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["expense", "income", "tax"] as const).map((t) => {
            const active =
              t === "expense" ? "bg-rose-600" : t === "income" ? "bg-emerald-600" : "bg-amber-600";
            const label = t === "expense" ? "Gasto" : t === "income" ? "Ingreso" : "Impuesto";
            return (
              <button
                key={t}
                type="button"
                onClick={() => changeType(t)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t ? `${active} text-white` : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["personal", "empresa"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLedger(l)}
              className={`py-2 rounded-lg text-sm capitalize transition-colors ${
                ledger === l ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-xs text-neutral-400">Importe (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-neutral-400">Categoría</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm capitalize"
            >
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-400">Fecha</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-neutral-400">Subcategoría</span>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="opcional"
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-400">Cuenta</span>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="banco"
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-neutral-400">Descripción</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="opcional"
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs text-neutral-400">Factura (PDF, opcional)</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-700"
          />
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : "Guardar movimiento"}
        </button>
      </form>
    </div>
  );
}

function MonthlyChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return <p className="text-neutral-500 text-sm">Sin datos.</p>;
  }
  const W = 620;
  const H = 180;
  const pad = { top: 10, bottom: 24, left: 8, right: 8 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense, d.tax)));
  const groupW = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(14, groupW / 4);
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
                x={cx - barW * 1.5 - 2}
                y={y(d.income)}
                width={barW}
                height={pad.top + chartH - y(d.income)}
                rx={2}
                fill="#34d399"
              />
              <rect
                x={cx - barW / 2}
                y={y(d.expense)}
                width={barW}
                height={pad.top + chartH - y(d.expense)}
                rx={2}
                fill="#fb7185"
              />
              <rect
                x={cx + barW / 2 + 2}
                y={y(d.tax)}
                width={barW}
                height={pad.top + chartH - y(d.tax)}
                rx={2}
                fill="#fbbf24"
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
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#fbbf24" }} />
          Impuestos
        </span>
      </div>
    </div>
  );
}

function RecurringModal({
  defaultLedger,
  onClose,
  onChanged,
}: {
  defaultLedger: "personal" | "empresa";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"expense" | "tax">("expense");
  const [ledger, setLedger] = useState<"personal" | "empresa">(defaultLedger);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [account, setAccount] = useState("banco");
  const [day, setDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cats = type === "tax" ? TAX_CATEGORIES : EXPENSE_CATEGORIES;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/recurring");
      if (res.ok) setItems((await res.json()).recurring ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function changeType(t: "expense" | "tax") {
    setType(t);
    setCategory((t === "tax" ? TAX_CATEGORIES : EXPENSE_CATEGORIES)[0]);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) {
      setError("Introduce un importe válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: value,
          type,
          ledger,
          category,
          description: description.trim() || undefined,
          account: account.trim() || undefined,
          day_of_month: Number(day) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return;
      }
      setAmount("");
      setDescription("");
      await load();
      onChanged();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este gasto fijo? Los ya registrados se conservan.")) return;
    await fetch("/api/finance/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Gastos fijos mensuales</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        <p className="text-xs text-neutral-500">
          Se registran solos cada mes en el día indicado.
        </p>

        {loading ? (
          <p className="text-neutral-500 text-sm">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-500 text-sm">Sin gastos fijos todavía.</p>
        ) : (
          <div className="divide-y divide-neutral-800">
            {items.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    <span className="capitalize">{r.category}</span>
                    {r.description ? (
                      <span className="text-neutral-400"> · {r.description}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-neutral-500">
                    día {r.day_of_month} · {r.ledger} · {r.account}
                    {r.type === "tax" ? " · impuesto" : ""}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums text-rose-400">
                  {eur(r.amount)}
                </span>
                <button
                  onClick={() => remove(r.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 transition text-xs"
                  aria-label="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={add} className="space-y-3 border-t border-neutral-800 pt-4">
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "tax"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeType(t)}
                className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t
                    ? t === "tax"
                      ? "bg-amber-600 text-white"
                      : "bg-rose-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {t === "tax" ? "Impuesto" : "Gasto"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["personal", "empresa"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLedger(l)}
                className={`py-2 rounded-lg text-sm capitalize transition-colors ${
                  ledger === l ? "bg-amber-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-neutral-400">Importe (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-400">Día del mes</span>
              <input
                type="number"
                min={1}
                max={28}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-neutral-400">Categoría</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm capitalize"
              >
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-neutral-400">Cuenta</span>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="banco"
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-neutral-400">Descripción</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej: alquiler, Netflix"
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? "Guardando…" : "Añadir gasto fijo"}
          </button>
        </form>
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

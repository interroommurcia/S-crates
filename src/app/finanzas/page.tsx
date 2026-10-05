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
  ledger: "personal" | "empresa";
  receipt_path: string | null;
  pending: boolean;
  recurring_id: string | null;
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

type SourceBucket = { personal: number; empresa: number; rentas: number };
type SeriesPoint = {
  month: string;
  income: number;
  expense: number;
  tax: number;
  projected?: boolean;
  incomeBy?: SourceBucket;
  expenseBy?: SourceBucket;
};

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
  const [range, setRange] = useState<6 | 12>(6);
  const [ledger, setLedger] = useState<LedgerFilter>("personal");
  const [report, setReport] = useState<Report | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [txFilter, setTxFilter] = useState<"todos" | "proximamente" | "fijos">("todos");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = ledger === "conjunto" ? "" : `&ledger=${ledger}`;
      const res = await fetch(`/api/finance?month=${month}&months=${range}${q}`);
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
  }, [month, ledger, range]);

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

  async function markCobrado(id: string) {
    if (!confirm("¿Seguro que has cobrado este ingreso?")) return;
    await fetch("/api/finance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pending: false, date: new Date().toISOString().slice(0, 10) }),
    });
    load();
  }

  const maxCat = report?.expenses_by_category[0]?.amount ?? 0;
  const pendingCount = txs.filter((t) => t.pending).length;
  const fijosCount = txs.filter((t) => t.recurring_id).length;
  const visibleTxs =
    txFilter === "proximamente"
      ? txs.filter((t) => t.pending)
      : txFilter === "fijos"
      ? txs.filter((t) => t.recurring_id)
      : txs;

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
        <div className="flex items-center gap-3">
          <Link
            href="/finanzas/rentas"
            className="text-sm text-neutral-400 hover:text-amber-500 transition-colors"
          >
            Rentas
          </Link>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>
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

        <NotesPostit />

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-neutral-300">
              Evolución · ingresos, gastos e impuestos
            </h2>
            <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5">
              {([6, 12] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    range === r ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {r === 6 ? "6 meses" : "1 año"}
                </button>
              ))}
            </div>
          </div>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-neutral-300">
              Movimientos ({visibleTxs.length})
            </h2>
            <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5">
              {(["todos", "proximamente", "fijos"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTxFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    txFilter === f ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {f === "todos"
                    ? "Todos"
                    : f === "proximamente"
                    ? `Próximamente${pendingCount ? ` (${pendingCount})` : ""}`
                    : `Fijos${fijosCount ? ` (${fijosCount})` : ""}`}
                </button>
              ))}
            </div>
          </div>
          {visibleTxs.length === 0 && !loading ? (
            <p className="text-neutral-500 text-sm">
              {txFilter === "proximamente"
                ? "Sin ingresos por cobrar."
                : txFilter === "fijos"
                ? "Sin gastos fijos este mes."
                : "Sin movimientos. Registra gastos hablando con Sócrates: “gasté 40 en el super”."}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {visibleTxs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3 group">
                  <div
                    onClick={() => setEditTx(t)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <p className="text-sm truncate">
                      <span className="capitalize">{t.category}</span>
                      {t.pending ? (
                        <span className="ml-2 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[10px] font-medium align-middle">
                          Próximamente
                        </span>
                      ) : null}
                      {t.recurring_id ? (
                        <span className="ml-2 rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium align-middle">
                          Fijo
                        </span>
                      ) : null}
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
                            onClick={(e) => e.stopPropagation()}
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
                      t.pending
                        ? "text-neutral-500 line-through"
                        : t.type === "income"
                        ? "text-emerald-400"
                        : t.type === "tax"
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {eur(t.amount)}
                  </span>
                  {t.pending ? (
                    <button
                      onClick={() => markCobrado(t.id)}
                      className="shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-xs font-medium transition-colors"
                    >
                      Cobrado
                    </button>
                  ) : null}
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

      {editTx && (
        <NewTxForm
          defaultLedger={editTx.ledger}
          editTx={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
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
  editTx,
  onClose,
  onSaved,
}: {
  defaultLedger: "personal" | "empresa";
  editTx?: Tx | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TxType>(editTx?.type ?? "expense");
  const [ledger, setLedger] = useState<"personal" | "empresa">(editTx?.ledger ?? defaultLedger);
  const [amount, setAmount] = useState(editTx ? String(editTx.amount).replace(".", ",") : "");
  const [category, setCategory] = useState(editTx?.category ?? EXPENSE_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState(editTx?.subcategory ?? "");
  const [description, setDescription] = useState(editTx?.description ?? "");
  const [account, setAccount] = useState(editTx?.account ?? "banco");
  const [date, setDate] = useState(editTx?.occurred_at ?? (() => new Date().toISOString().slice(0, 10)));
  const [pending, setPending] = useState(editTx?.pending ?? false);
  const [fixed, setFixed] = useState(
    editTx ? editTx.type === "income" && !!editTx.recurring_id : false
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catsFor = (t: TxType) =>
    t === "expense" ? EXPENSE_CATEGORIES : t === "tax" ? TAX_CATEGORIES : INCOME_CATEGORIES;
  const cats = catsFor(type);

  function changeType(t: TxType) {
    setType(t);
    setCategory(catsFor(t)[0]);
    if (t !== "income") {
      setPending(false);
      setFixed(false);
    }
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
      if (editTx) {
        const res = await fetch("/api/finance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editTx.id,
            amount: value,
            type,
            ledger,
            category,
            subcategory: subcategory.trim() || null,
            description: description.trim() || null,
            account: account.trim() || undefined,
            date,
            pending,
            fixed: type === "income" ? fixed : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No se pudo guardar.");
          return;
        }
        onSaved();
        return;
      }

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
          pending,
          fixed: type === "income" ? fixed : undefined,
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
          <h2 className="text-lg font-semibold">{editTx ? "Editar movimiento" : "Nuevo movimiento"}</h2>
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

        {type === "income" && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pending}
                onChange={(e) => {
                  setPending(e.target.checked);
                  if (e.target.checked) setFixed(false);
                }}
                className="accent-amber-500"
              />
              <span className="text-sm">
                Próximamente <span className="text-neutral-500">(por cobrar — no cuenta hasta marcarlo cobrado)</span>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fixed}
                onChange={(e) => {
                  setFixed(e.target.checked);
                  if (e.target.checked) setPending(false);
                }}
                className="accent-emerald-500"
              />
              <span className="text-sm">
                Ingreso fijo <span className="text-neutral-500">(se repite cada mes y entra en la proyección)</span>
              </span>
            </label>
          </div>
        )}

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

        {!editTx && (
          <label className="block">
            <span className="text-xs text-neutral-400">Factura (PDF, opcional)</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-700"
            />
          </label>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : editTx ? "Guardar cambios" : "Guardar movimiento"}
        </button>
      </form>
    </div>
  );
}

type SourceColors = Record<keyof SourceBucket, string>;
const INCOME_SHADES: SourceColors = { personal: "#065f46", empresa: "#34d399", rentas: "#bbf7d0" };
const EXPENSE_SHADES: SourceColors = { personal: "#9f1239", empresa: "#fb7185", rentas: "#fecdd3" };
const SOURCE_ORDER: (keyof SourceBucket)[] = ["personal", "empresa", "rentas"];
const SOURCE_LABEL: Record<keyof SourceBucket, string> = {
  personal: "Personal",
  empresa: "Empresa",
  rentas: "Rentas",
};
const INCOME_BASE = "#34d399";
const EXPENSE_BASE = "#fb7185";
const TAX_BASE = "#fbbf24";
const NET_COLOR = "#e5e5e5";
const SEG_GAP = 1.5; // separador entre tramos apilados

function MonthlyChart({ data }: { data: SeriesPoint[] }) {
  const [visible, setVisible] = useState({ income: true, expense: true, tax: true, net: true });
  const [hover, setHover] = useState<number | null>(null);
  const toggle = (k: keyof typeof visible) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  if (data.length === 0) {
    return <p className="text-neutral-500 text-sm">Sin datos.</p>;
  }

  const isConjunto = data.some((d) => d.incomeBy || d.expenseBy);
  const W = 640;
  const H = 230;
  const pad = { top: 14, bottom: 34, left: 54, right: 10 };
  const chartH = H - pad.top - pad.bottom;
  const chartW = W - pad.left - pad.right;

  const net = data.map((d) => d.income - d.expense - d.tax);
  const barVals = data.flatMap((d) => [
    visible.income ? d.income : 0,
    visible.expense ? d.expense : 0,
    visible.tax ? d.tax : 0,
  ]);
  const netVals = visible.net ? net : [0];
  const max = Math.max(1, ...barVals, ...netVals);
  const min = Math.min(0, ...netVals);
  const span = max - min || 1;
  const y = (v: number) => pad.top + chartH * (1 - (v - min) / span);
  const baseY = y(0);

  const groupW = chartW / data.length;
  const barW = Math.min(18, groupW / 4.2);
  const cx = (i: number) => pad.left + groupW * i + groupW / 2;

  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
  const fmtTick = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1000) return `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k`;
    return `${Math.round(v)}`;
  };
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("es-ES", { month: "short" });

  const rect = (
    key: string,
    xc: number,
    yTop: number,
    h: number,
    color: string,
    projected: boolean
  ) => (
    <rect
      key={key}
      x={xc}
      y={yTop}
      width={barW}
      height={Math.max(0, h)}
      rx={2}
      fill={color}
      fillOpacity={projected ? 0.4 : 1}
      stroke={projected ? color : "none"}
      strokeWidth={projected ? 0.75 : 0}
      strokeDasharray={projected ? "2 1.5" : undefined}
    />
  );

  const singleBar = (xc: number, v: number, color: string, projected: boolean, key: string) =>
    v > 0 ? rect(key, xc, y(v), baseY - y(v), color, projected) : null;

  const stackBar = (
    xc: number,
    buckets: SourceBucket,
    palette: SourceColors,
    projected: boolean,
    kind: string
  ) => {
    let acc = 0;
    return SOURCE_ORDER.map((k) => {
      const v = buckets[k];
      if (!(v > 0)) return null;
      const yTop = y(acc + v);
      const h = Math.max(0, y(acc) - y(acc + v) - SEG_GAP);
      acc += v;
      return rect(`${kind}-${k}`, xc, yTop, h, palette[k], projected);
    });
  };

  const netPts = net.map((v, i) => `${cx(i)},${y(v)}`);
  const lastReal = data.findIndex((d) => d.projected);
  const splitIdx = lastReal === -1 ? net.length : lastReal; // primer proyectado

  const legendBtn = (k: keyof typeof visible, label: string, swatch: React.ReactNode) => (
    <button
      type="button"
      onClick={() => toggle(k)}
      title="Mostrar / ocultar"
      className={`flex items-center gap-1.5 cursor-pointer rounded-md px-2 py-0.5 border transition-colors ${
        visible[k]
          ? "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
          : "border-neutral-800 text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {swatch}
      <span className={visible[k] ? "" : "line-through"}>{label}</span>
    </button>
  );

  const hd = hover != null ? data[hover] : null;
  const tipLeftPct = hover != null ? (cx(hover) / W) * 100 : 0;
  const tipShift = hover == null ? "-50%" : hover >= data.length - 2 ? "-88%" : hover <= 1 ? "-12%" : "-50%";

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 480 }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} y1={y(t)} x2={W - pad.right} y2={y(t)} stroke="#262626" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#737373">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {min < 0 && (
          <line x1={pad.left} y1={baseY} x2={W - pad.right} y2={baseY} stroke="#525252" strokeWidth={1} />
        )}

        {hover != null && (
          <rect
            x={pad.left + groupW * hover}
            y={pad.top}
            width={groupW}
            height={chartH}
            fill="#ffffff"
            opacity={0.04}
          />
        )}

        {data.map((d, i) => {
          const c = cx(i);
          const proj = !!d.projected;
          return (
            <g key={d.month}>
              {visible.income &&
                (isConjunto && d.incomeBy
                  ? stackBar(c - barW * 1.5 - 2, d.incomeBy, INCOME_SHADES, proj, "Ingresos")
                  : singleBar(c - barW * 1.5 - 2, d.income, INCOME_BASE, proj, `inc-${i}`))}
              {visible.expense &&
                (isConjunto && d.expenseBy
                  ? stackBar(c - barW / 2, d.expenseBy, EXPENSE_SHADES, proj, "Gastos")
                  : singleBar(c - barW / 2, d.expense, EXPENSE_BASE, proj, `exp-${i}`))}
              {visible.tax && singleBar(c + barW / 2 + 2, d.tax, TAX_BASE, proj, `tax-${i}`)}
              <text x={c} y={H - 16} textAnchor="middle" fontSize="10" fill="#a3a3a3">
                {monthLabel(d.month)}
              </text>
              {proj && (
                <text x={c} y={H - 5} textAnchor="middle" fontSize="8" fill="#737373">
                  proy.
                </text>
              )}
            </g>
          );
        })}

        {visible.net && (
          <>
            <polyline points={netPts.slice(0, splitIdx + 1).join(" ")} fill="none" stroke={NET_COLOR} strokeWidth={1.5} />
            {splitIdx < net.length - 1 && (
              <polyline
                points={netPts.slice(splitIdx).join(" ")}
                fill="none"
                stroke={NET_COLOR}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.7}
              />
            )}
            {net.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r={2.2} fill={NET_COLOR} />
            ))}
          </>
        )}

        {/* Zonas de hover por mes (encima de todo, transparentes) */}
        {data.map((d, i) => (
          <rect
            key={`hit-${d.month}`}
            x={pad.left + groupW * i}
            y={pad.top}
            width={groupW}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseMove={() => setHover(i)}
          />
        ))}
      </svg>

      {hd && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-neutral-700 bg-neutral-950/95 px-3 py-2 text-[11px] shadow-xl"
          style={{ left: `${tipLeftPct}%`, transform: `translateX(${tipShift})`, minWidth: 140 }}
        >
          <p className="mb-1 font-medium text-neutral-200 capitalize">
            {monthLabel(hd.month)}
            {hd.projected ? <span className="text-neutral-500"> · proyección</span> : null}
          </p>
          <TipRow color={INCOME_BASE} label="Ingresos" value={hd.income} />
          {isConjunto && hd.incomeBy && <TipBreakdown by={hd.incomeBy} palette={INCOME_SHADES} />}
          <TipRow color={EXPENSE_BASE} label="Gastos" value={hd.expense} />
          {isConjunto && hd.expenseBy && <TipBreakdown by={hd.expenseBy} palette={EXPENSE_SHADES} />}
          <TipRow color={TAX_BASE} label="Impuestos" value={hd.tax} />
          <div className="mt-1 border-t border-neutral-800 pt-1">
            <TipRow color={NET_COLOR} label="Neto" value={hd.income - hd.expense - hd.tax} bold />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mt-3 text-xs text-neutral-400">
        {legendBtn(
          "income",
          "Ingresos",
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: INCOME_BASE }} />
        )}
        {legendBtn(
          "expense",
          "Gastos",
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: EXPENSE_BASE }} />
        )}
        {legendBtn(
          "tax",
          "Impuestos",
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: TAX_BASE }} />
        )}
        {legendBtn("net", "Neto", <span className="inline-block w-4 border-t-2 border-neutral-200" />)}
        <span className="flex items-center gap-1.5 px-2 py-0.5">
          <span
            className="w-3 h-3 rounded-sm inline-block border border-neutral-600 opacity-40"
            style={{ background: "#9ca3af" }}
          />
          Proyección
        </span>
      </div>

      {isConjunto && (
        <p className="mt-2 text-center text-[11px] text-neutral-500">
          Cada barra se divide por origen (de oscuro a claro):{" "}
          {SOURCE_ORDER.map((k, i) => (
            <span key={k} className="whitespace-nowrap">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block align-middle mr-1"
                style={{ background: INCOME_SHADES[k] }}
              />
              {SOURCE_LABEL[k]}
              {i < SOURCE_ORDER.length - 1 ? " · " : ""}
            </span>
          ))}
          <span className="text-neutral-600"> (mismos tonos en gastos, en rojo)</span>
        </p>
      )}
    </div>
  );
}

function TipRow({
  color,
  label,
  value,
  bold,
}: {
  color: string;
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-neutral-400">
        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
        {label}
      </span>
      <span className={`tabular-nums ${bold ? "font-semibold text-neutral-100" : "text-neutral-300"}`}>
        {eur(value)}
      </span>
    </div>
  );
}

function TipBreakdown({ by, palette }: { by: SourceBucket; palette: SourceColors }) {
  const rows = SOURCE_ORDER.filter((k) => by[k] > 0);
  if (rows.length === 0) return null;
  return (
    <div className="mb-0.5 ml-4 space-y-0.5">
      {rows.map((k) => (
        <div key={k} className="flex items-center justify-between gap-4 text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: palette[k] }} />
            {SOURCE_LABEL[k]}
          </span>
          <span className="tabular-nums">{eur(by[k])}</span>
        </div>
      ))}
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
      if (res.ok) {
        const all = ((await res.json()).recurring ?? []) as Recurring[];
        setItems(all.filter((r) => (r.type as string) !== "income")); // ingresos fijos se gestionan en el movimiento
      }
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
    if (!confirm("¿Eliminar este gasto fijo?")) return;
    const purge = confirm(
      "¿Borrar también los movimientos ya registrados de este fijo?\n\nAceptar = sí (para unificar duplicados)\nCancelar = conservarlos"
    );
    await fetch("/api/finance/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, purge }),
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

type Note = { id: string; content: string; color: string; created_at: string };

const NOTE_COLORS: Record<string, string> = {
  amber: "bg-amber-200 text-amber-950 shadow-amber-900/30",
  rose: "bg-rose-200 text-rose-950 shadow-rose-900/30",
  sky: "bg-sky-200 text-sky-950 shadow-sky-900/30",
  emerald: "bg-emerald-200 text-emerald-950 shadow-emerald-900/30",
};
const COLOR_CYCLE = ["amber", "rose", "sky", "emerald"];

function NotesPostit() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) setNotes(await res.json());
    } catch {
      /* red: conserva notas previas */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const color = COLOR_CYCLE[notes.length % COLOR_CYCLE.length];
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "", color }),
    });
    if (res.ok) {
      const created = await res.json();
      setNotes((prev) => [created, ...prev]);
    }
  }

  async function save(id: string, content: string) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-300">
          Notas <span className="text-neutral-500 font-normal">· se borran a los 100 días</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            {open ? "Ocultar" : "Mostrar"}
          </button>
          <button
            onClick={add}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            + Nota
          </button>
        </div>
      </div>

      {open &&
        (notes.length === 0 ? (
          <p className="text-neutral-500 text-sm">Sin notas. Añade un post-it.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {notes.map((n, i) => (
              <div
                key={n.id}
                className={`group relative w-44 h-44 rounded-sm p-3 shadow-lg ${
                  NOTE_COLORS[n.color] ?? NOTE_COLORS.amber
                } ${i % 2 ? "rotate-1" : "-rotate-1"}`}
              >
                <button
                  onClick={() => remove(n.id)}
                  className="absolute top-1 right-1.5 text-black/30 hover:text-black/70 opacity-0 group-hover:opacity-100 transition text-sm"
                  aria-label="Borrar nota"
                >
                  ✕
                </button>
                <textarea
                  defaultValue={n.content}
                  onBlur={(e) => {
                    if (e.target.value !== n.content) save(n.id, e.target.value);
                  }}
                  placeholder="Escribe…"
                  className="w-full h-full resize-none bg-transparent text-sm leading-snug placeholder-black/30 focus:outline-none"
                />
              </div>
            ))}
          </div>
        ))}
    </section>
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

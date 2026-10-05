"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
  property_id: string | null;
  recurring_id: string | null;
  occurred_at: string;
};

type Recurring = {
  id: string;
  amount: number;
  type: "income" | "expense" | "tax";
  category: string;
  description: string | null;
  day_of_month: number;
  property_id: string | null;
};

type Property = {
  id: string;
  name: string;
  income: number;
  expense: number;
  tax: number;
  net: number;
};

type NetPoint = { month: string; net: number };

const RENT_INCOME_CATEGORIES = ["alquiler", "reservas", "fianza", "otros"];
const RENT_EXPENSE_CATEGORIES = [
  "alquiler",
  "limpieza",
  "suministros",
  "mantenimiento",
  "seguros",
  "comisiones",
  "impuestos",
  "otros",
];

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Rentas() {
  const [month, setMonth] = useState(currentMonth);
  const [properties, setProperties] = useState<Property[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [series, setSeries] = useState<NetPoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMove, setShowMove] = useState(false);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [showFijos, setShowFijos] = useState(false);
  const [showFijosIncome, setShowFijosIncome] = useState(false);
  const [showAddProp, setShowAddProp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/rentas?month=${month}`);
      if (!res.ok) return;
      const data = await res.json();
      const props: Property[] = data.properties ?? [];
      setProperties(props);
      setTxs(data.transactions ?? []);
      setRecurring(data.recurring ?? []);
      setSeries(data.series ?? []);
      setSelected((cur) => cur && props.some((p) => p.id === cur) ? cur : props[0]?.id ?? null);
    } catch {
      /* red: conserva datos */
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const current = properties.find((p) => p.id === selected) ?? null;
  const propTxs = useMemo(
    () => txs.filter((t) => t.property_id === selected),
    [txs, selected]
  );
  const propRecurring = useMemo(
    () => recurring.filter((r) => r.property_id === selected),
    [recurring, selected]
  );
  const fixedCosts = useMemo(() => propRecurring.filter((r) => r.type !== "income"), [propRecurring]);
  const fixedIncome = useMemo(() => propRecurring.filter((r) => r.type === "income"), [propRecurring]);
  const margin =
    current && current.income > 0 ? (current.net / current.income) * 100 : null;

  const totals = useMemo(() => {
    const income = properties.reduce((s, p) => s + p.income, 0);
    const costs = properties.reduce((s, p) => s + p.expense + p.tax, 0);
    const net = Math.round((income - costs) * 100) / 100;
    const margin = income > 0 ? (net / income) * 100 : null;
    return { income: Math.round(income * 100) / 100, costs: Math.round(costs * 100) / 100, net, margin };
  }, [properties]);

  async function removeTx(id: string) {
    if (!confirm("¿Borrar este movimiento?")) return;
    await fetch("/api/finance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function removeProperty() {
    if (!current) return;
    if (!confirm(`¿Eliminar el piso "${current.name}"? Sus movimientos se conservan.`)) return;
    await fetch("/api/finance/properties", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id }),
    });
    setSelected(null);
    load();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Link
            href="/finanzas"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold"
          >
            ‹
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Rentas indirectas</h1>
            <p className="text-xs text-neutral-400">Rentabilidad de pisos en explotación</p>
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
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {properties.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-300">
              Conjunto de pisos ({properties.length})
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card label="Ingresos" value={totals.income} accent="text-emerald-400" />
              <Card label="Costes" value={totals.costs} accent="text-rose-400" />
              <Card
                label="Neto rentas"
                value={totals.net}
                accent={totals.net >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
                <p className="text-xs text-neutral-400 mb-1">Margen</p>
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    (totals.margin ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {totals.margin === null ? "—" : `${totals.margin.toFixed(0)}%`}
                </p>
              </div>
            </div>
          </section>
        )}

        {properties.length > 0 && (
          <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
            <h2 className="text-sm font-semibold text-neutral-300 mb-4">
              Histórico anual · neto mensual
            </h2>
            <NetChart data={series} />
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`px-4 py-1.5 rounded-xl text-sm transition-colors border ${
                selected === p.id
                  ? "bg-amber-600 border-amber-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={() => setShowAddProp(true)}
            className="px-3 py-1.5 rounded-xl text-sm border border-dashed border-neutral-700 text-neutral-400 hover:text-white"
          >
            + Piso
          </button>
        </div>

        {!current ? (
          <p className="text-neutral-500 text-sm">
            {loading ? "Cargando…" : "Crea un piso para empezar."}
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card label="Ingresos" value={current.income} accent="text-emerald-400" />
              <Card label="Costes" value={current.expense + current.tax} accent="text-rose-400" />
              <Card
                label="Neto"
                value={current.net}
                accent={current.net >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
                <p className="text-xs text-neutral-400 mb-1">Margen</p>
                <p
                  className={`text-2xl font-semibold tabular-nums ${
                    (margin ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {margin === null ? "—" : `${margin.toFixed(0)}%`}
                </p>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowMove(true)}
                className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium transition-colors"
              >
                + Movimiento
              </button>
              <button
                onClick={() => setShowFijos(true)}
                className="rounded-xl border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors"
              >
                Costes fijos ({fixedCosts.length})
              </button>
              <button
                onClick={() => setShowFijosIncome(true)}
                className="rounded-xl border border-emerald-800 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 px-4 py-2 text-sm font-medium transition-colors"
              >
                Ingresos fijos ({fixedIncome.length})
              </button>
              <button
                onClick={removeProperty}
                className="ml-auto rounded-xl border border-neutral-800 text-neutral-500 hover:text-rose-400 px-4 py-2 text-sm transition-colors"
              >
                Eliminar piso
              </button>
            </div>

            <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
              <h2 className="text-sm font-semibold text-neutral-300 mb-4">
                Movimientos de {current.name} ({propTxs.length})
              </h2>
              {propTxs.length === 0 && !loading ? (
                <p className="text-neutral-500 text-sm">
                  Sin movimientos este mes. Añade ingresos y costes con “+ Movimiento”.
                </p>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {propTxs.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-3 group">
                      <div onClick={() => setEditTx(t)} className="flex-1 min-w-0 cursor-pointer">
                        <p className="text-sm truncate">
                          <span className="capitalize">{t.category}</span>
                          {t.recurring_id ? (
                            <span className="ml-2 rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5 text-[10px] font-medium align-middle">
                              Fijo
                            </span>
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
                        onClick={() => removeTx(t.id)}
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
          </>
        )}
      </div>

      {showAddProp && (
        <AddPropertyModal
          onClose={() => setShowAddProp(false)}
          onSaved={(id) => {
            setShowAddProp(false);
            setSelected(id);
            load();
          }}
        />
      )}

      {showMove && current && (
        <MoveForm
          propertyId={current.id}
          propertyName={current.name}
          month={month}
          onClose={() => setShowMove(false)}
          onSaved={() => {
            setShowMove(false);
            load();
          }}
        />
      )}

      {editTx && (
        <MoveForm
          propertyId={editTx.property_id ?? ""}
          propertyName={current?.name ?? ""}
          month={month}
          editTx={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            load();
          }}
        />
      )}

      {showFijos && current && (
        <FijosModal
          kind="expense"
          propertyId={current.id}
          propertyName={current.name}
          items={fixedCosts}
          onClose={() => setShowFijos(false)}
          onChanged={load}
        />
      )}

      {showFijosIncome && current && (
        <FijosModal
          kind="income"
          propertyId={current.id}
          propertyName={current.name}
          items={fixedIncome}
          onClose={() => setShowFijosIncome(false)}
          onChanged={load}
        />
      )}
    </main>
  );
}

function AddPropertyModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear.");
        return;
      }
      onSaved(data.property.id);
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo piso</h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>
        <label className="block">
          <span className="text-xs text-neutral-400">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Guadalupe"
            autoFocus
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : "Crear piso"}
        </button>
      </form>
    </Overlay>
  );
}

function MoveForm({
  propertyId,
  propertyName,
  month,
  editTx,
  onClose,
  onSaved,
}: {
  propertyId: string;
  propertyName: string;
  month: string;
  editTx?: Tx | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">(
    editTx?.type === "income" ? "income" : editTx ? "expense" : "income"
  );
  const [amount, setAmount] = useState(editTx ? String(editTx.amount).replace(".", ",") : "");
  const [category, setCategory] = useState(editTx?.category ?? RENT_INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState(editTx?.description ?? "");
  const [account, setAccount] = useState(editTx?.account ?? "banco");
  const [date, setDate] = useState(
    editTx?.occurred_at ??
      (() => {
        const today = new Date().toISOString().slice(0, 10);
        return today.slice(0, 7) === month ? today : `${month}-01`;
      })
  );
  const [fixed, setFixed] = useState(
    editTx ? editTx.type === "income" && !!editTx.recurring_id : false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cats = type === "income" ? RENT_INCOME_CATEGORIES : RENT_EXPENSE_CATEGORIES;

  function changeType(t: "income" | "expense") {
    setType(t);
    setCategory((t === "income" ? RENT_INCOME_CATEGORIES : RENT_EXPENSE_CATEGORIES)[0]);
    if (t !== "income") setFixed(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!(value > 0)) {
      setError("Introduce un importe válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance", {
        method: editTx ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editTx ? { id: editTx.id } : { ledger: "personal", property_id: propertyId }),
          amount: value,
          type,
          category,
          description: description.trim() || null,
          account: account.trim() || undefined,
          date,
          fixed: type === "income" ? fixed : undefined,
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
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editTx ? "Editar" : "Movimiento"} · {propertyName}
          </h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["income", "expense"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => changeType(t)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                type === t
                  ? t === "income"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {t === "income" ? "Ingreso" : "Coste"}
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
              autoFocus
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
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
            placeholder="opcional"
            className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {type === "income" && (
          <label className="flex items-center gap-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fixed}
              onChange={(e) => setFixed(e.target.checked)}
              className="accent-emerald-500"
            />
            <span className="text-sm">
              Ingreso fijo <span className="text-neutral-500">(se repite cada mes y entra en la proyección)</span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </Overlay>
  );
}

function FijosModal({
  kind,
  propertyId,
  propertyName,
  items,
  onClose,
  onChanged,
}: {
  kind: "income" | "expense";
  propertyId: string;
  propertyName: string;
  items: Recurring[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const isIncome = kind === "income";
  const catList = isIncome ? RENT_INCOME_CATEGORIES : RENT_EXPENSE_CATEGORIES;
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(catList[0]);
  const [description, setDescription] = useState("");
  const [day, setDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          type: kind,
          ledger: "personal",
          property_id: propertyId,
          category,
          description: description.trim() || undefined,
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
      onChanged();
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(`¿Eliminar este ${isIncome ? "ingreso" : "coste"} fijo?`)) return;
    const purge = confirm(
      "¿Borrar también los movimientos ya registrados de este fijo?\n\nAceptar = sí (para unificar duplicados)\nCancelar = conservarlos"
    );
    await fetch("/api/finance/recurring", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, purge }),
    });
    onChanged();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isIncome ? "Ingresos fijos" : "Costes fijos"} · {propertyName}
          </h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">
            ✕
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          {isIncome
            ? "Alquiler mensual, etc. Se registran solos cada mes y entran en la proyección."
            : "Alquiler, limpieza, etc. Se registran solos cada mes en el día indicado."}
        </p>

        {items.length === 0 ? (
          <p className="text-neutral-500 text-sm">
            Sin {isIncome ? "ingresos" : "costes"} fijos todavía.
          </p>
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
                  <p className="text-xs text-neutral-500">día {r.day_of_month}</p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    isIncome ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isIncome ? "+" : ""}
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
          <label className="block">
            <span className="text-xs text-neutral-400">Categoría</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm capitalize"
            >
              {catList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-400">Descripción</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIncome ? "ej: alquiler inquilino" : "ej: alquiler propietario, limpieza"}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? "Guardando…" : isIncome ? "Añadir ingreso fijo" : "Añadir coste fijo"}
          </button>
        </form>
      </div>
    </Overlay>
  );
}

function NetChart({ data }: { data: NetPoint[] }) {
  if (data.length === 0) {
    return <p className="text-neutral-500 text-sm">Sin datos.</p>;
  }
  const GREEN = "#34d399";
  const RED = "#fb7185";
  const W = 680;
  const H = 260;
  const pad = { top: 30, bottom: 28, left: 10, right: 10 };
  const range = Math.max(1, ...data.map((d) => Math.abs(d.net)));
  const chartH = H - pad.top - pad.bottom;
  const half = chartH / 2;
  const y0 = pad.top + half;
  const groupW = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(20, groupW * 0.5);
  const y = (v: number) => y0 - (v / range) * half;

  const pts = data.map((d, i) => ({
    x: pad.left + groupW * i + groupW / 2,
    y: y(d.net),
    net: d.net,
  }));

  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString("es-ES", { month: "short" });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
        {/* Línea cero */}
        <line x1={pad.left} y1={y0} x2={W - pad.right} y2={y0} stroke="#3f3f46" strokeWidth={1} />

        {/* Barras */}
        {data.map((d, i) => {
          const yv = y(d.net);
          const pos = d.net >= 0;
          return (
            <rect
              key={d.month}
              x={pts[i].x - barW / 2}
              y={pos ? yv : y0}
              width={barW}
              height={Math.max(1, Math.abs(yv - y0))}
              rx={2}
              fill={pos ? GREEN : RED}
              opacity={0.3}
            />
          );
        })}

        {/* Línea de evolución (verde por encima de 0, roja al bajar) */}
        {pts.map((p, i) => {
          if (i === 0) return null;
          const prev = pts[i - 1];
          const color = prev.net >= 0 && p.net >= 0 ? GREEN : RED;
          return (
            <line key={`l${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={color} strokeWidth={2} />
          );
        })}

        {/* Puntos y números */}
        {pts.map((p, i) => {
          const pos = p.net >= 0;
          return (
            <g key={`p${i}`}>
              <circle cx={p.x} cy={p.y} r={3} fill={pos ? GREEN : RED} />
              <text
                x={p.x}
                y={pos ? p.y - 8 : p.y + 15}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={pos ? GREEN : RED}
              >
                {Math.round(p.net)}
              </text>
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#a3a3a3">
                {monthLabel(data[i].month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
      >
        {children}
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

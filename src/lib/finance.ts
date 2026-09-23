import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { supabaseAdmin } from "./supabase-server";

export const EXPENSE_CATEGORIES = [
  "alimentacion",
  "restaurantes",
  "transporte",
  "vivienda",
  "suministros",
  "salud",
  "ocio",
  "ropa",
  "educacion",
  "viajes",
  "regalos",
  "suscripciones",
  "impuestos",
  "trabajo",
  "otros",
] as const;

export const INCOME_CATEGORIES = [
  "salario",
  "freelance",
  "ventas",
  "alquiler",
  "intereses",
  "regalo",
  "otros",
] as const;

export type Transaction = {
  id: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  description: string | null;
  account: string;
  occurred_at: string;
  created_at: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(ref = new Date()): { from: string; to: string } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export const financeTools: Tool[] = [
  {
    name: "add_transaction",
    description:
      "Registra un movimiento economico (gasto o ingreso). Usalo cuando el usuario mencione que gasto, cobro, pago o ingreso dinero (ej: 'gaste 40 en el super', 'me pagaron la nomina 1800'). Extrae importe, tipo y categoria del mensaje.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Importe en euros, siempre positivo." },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "expense = gasto/pago, income = ingreso/cobro.",
        },
        category: {
          type: "string",
          description:
            "Categoria. Para gastos usa una de: alimentacion, restaurantes, transporte, vivienda, suministros, salud, ocio, ropa, educacion, viajes, regalos, suscripciones, impuestos, trabajo, otros. Para ingresos: salario, freelance, ventas, alquiler, intereses, regalo, otros.",
        },
        subcategory: {
          type: "string",
          description: "Subcategoria concreta para analisis (ej: 'supermercado', 'gasolina', 'netflix'). Opcional.",
        },
        description: {
          type: "string",
          description: "Detalle libre opcional (ej: 'Mercadona', 'cena con Ana').",
        },
        account: {
          type: "string",
          description: "Cuenta/medio: efectivo, banco, tarjeta. Default efectivo.",
        },
        date: {
          type: "string",
          description:
            "Fecha del movimiento en formato YYYY-MM-DD. Si el usuario dice 'ayer' u otra fecha relativa, resuelvela tu a fecha absoluta. Default hoy.",
        },
      },
      required: ["amount", "type", "category"],
    },
  },
  {
    name: "query_transactions",
    description:
      "Lista movimientos con filtros y devuelve tambien el total. Usalo cuando el usuario pregunte por movimientos concretos ('que gaste en restaurantes este mes', 'ultimos ingresos').",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)." },
        to: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)." },
        category: { type: "string", description: "Filtrar por categoria (opcional)." },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Filtrar por tipo (opcional).",
        },
        limit: { type: "integer", description: "Maximo de filas (default 30)." },
      },
    },
  },
  {
    name: "spending_report",
    description:
      "Resumen contable de un periodo: total ingresos, total gastos, balance y desglose de gastos por categoria. Usalo para preguntas tipo 'como voy este mes', 'cuanto he gastado', 'resumen de finanzas'. Sin fechas asume el mes actual.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional, default inicio de mes)." },
        to: { type: "string", description: "Fecha fin YYYY-MM-DD (opcional, default fin de mes)." },
      },
    },
  },
  {
    name: "delete_transaction",
    description:
      "Borra un movimiento por id. Usalo si el usuario pide eliminar o corregir un movimiento mal registrado. El id lo devuelve query_transactions.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID del movimiento." },
      },
      required: ["id"],
    },
  },
];

export const financeToolNames = new Set(financeTools.map((t) => t.name));

type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function runFinanceTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "add_transaction":
        return await addTransaction(input);
      case "query_transactions":
        return await queryTransactions(input);
      case "spending_report":
        return await spendingReport(input);
      case "delete_transaction":
        return await deleteTransaction(input);
      default:
        return { ok: false, error: `Finance tool desconocida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function addTransaction(input: Record<string, unknown>): Promise<ToolResult> {
  const amount = Number(input.amount);
  if (!(amount > 0)) return { ok: false, error: "amount debe ser positivo" };
  const type = input.type === "income" ? "income" : "expense";
  const category = String(input.category ?? "otros").trim().toLowerCase() || "otros";
  const subcategory = input.subcategory
    ? String(input.subcategory).trim().toLowerCase() || null
    : null;
  const description = input.description ? String(input.description) : null;
  const account = input.account ? String(input.account) : "efectivo";
  const occurred_at =
    typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : today();

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert({ amount, type, category, subcategory, description, account, occurred_at })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function queryTransactions(input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.max(1, Math.min(200, Number(input.limit ?? 30)));
  let q = supabaseAdmin
    .from("transactions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (typeof input.from === "string") q = q.gte("occurred_at", input.from);
  if (typeof input.to === "string") q = q.lte("occurred_at", input.to);
  if (typeof input.category === "string") q = q.eq("category", String(input.category).toLowerCase());
  if (input.type === "income" || input.type === "expense") q = q.eq("type", input.type);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Transaction[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return { ok: true, data: { count: rows.length, total: round2(total), transactions: rows } };
}

async function spendingReport(input: Record<string, unknown>): Promise<ToolResult> {
  const { from, to } =
    typeof input.from === "string" || typeof input.to === "string"
      ? { from: (input.from as string) ?? "1900-01-01", to: (input.to as string) ?? today() }
      : monthRange();

  const report = await computeReport(from, to);
  return { ok: true, data: report };
}

export async function computeReport(from: string, to: string) {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("amount, type, category, occurred_at")
    .gte("occurred_at", from)
    .lte("occurred_at", to);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<Transaction, "amount" | "type" | "category" | "occurred_at">[];

  let income = 0;
  let expense = 0;
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    const a = Number(r.amount);
    if (r.type === "income") {
      income += a;
    } else {
      expense += a;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + a;
    }
  }

  const expenses_by_category = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    period: { from, to },
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense),
    transaction_count: rows.length,
    expenses_by_category,
  };
}

export async function monthlySeries(
  endRef: Date,
  count = 6
): Promise<{ month: string; income: number; expense: number }[]> {
  const y = endRef.getUTCFullYear();
  const m = endRef.getUTCMonth();
  const start = new Date(Date.UTC(y, m - (count - 1), 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const { data } = await supabaseAdmin
    .from("transactions")
    .select("amount, type, occurred_at")
    .gte("occurred_at", from)
    .lte("occurred_at", to);

  const buckets: Record<string, { income: number; expense: number }> = {};
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - (count - 1) + i, 1));
    buckets[d.toISOString().slice(0, 7)] = { income: 0, expense: 0 };
  }
  for (const r of data ?? []) {
    const key = String(r.occurred_at).slice(0, 7);
    if (!buckets[key]) continue;
    if (r.type === "income") buckets[key].income += Number(r.amount);
    else buckets[key].expense += Number(r.amount);
  }

  return Object.entries(buckets).map(([month, v]) => ({
    month,
    income: round2(v.income),
    expense: round2(v.expense),
  }));
}

async function deleteTransaction(input: Record<string, unknown>): Promise<ToolResult> {
  const id = String(input.id ?? "");
  if (!id) return { ok: false, error: "id vacio" };
  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { deleted: id } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

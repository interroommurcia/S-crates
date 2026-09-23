import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { supabaseAdmin } from "./supabase-server";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./finance";

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x20-\x7E]/g, ""),
});

const MODEL = "claude-haiku-4-5-20251001";
const MAX_ROWS = 400;

export type ParsedTx = {
  occurred_at: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
};

const parseTool: Tool = {
  name: "submit_transactions",
  description: "Devuelve los movimientos bancarios normalizados y categorizados.",
  input_schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            occurred_at: { type: "string", description: "Fecha YYYY-MM-DD." },
            description: { type: "string", description: "Concepto limpio y legible." },
            amount: { type: "number", description: "Importe SIEMPRE positivo en euros." },
            type: { type: "string", enum: ["income", "expense"] },
            category: {
              type: "string",
              description: `Categoria. Gastos: ${EXPENSE_CATEGORIES.join(", ")}. Ingresos: ${INCOME_CATEGORIES.join(", ")}.`,
            },
            subcategory: {
              type: "string",
              description: "Subcategoria corta y concreta para analisis (ej: 'supermercado', 'gasolina', 'netflix', 'restaurante'). Vacio si no aplica.",
            },
          },
          required: ["occurred_at", "description", "amount", "type", "category"],
        },
      },
    },
    required: ["transactions"],
  },
};

const SYSTEM = `Eres un parser experto de extractos bancarios espanoles.
Recibes el contenido crudo de un CSV (cualquier banco/formato) y devuelves cada movimiento normalizado.
Reglas:
- Detecta tu las columnas de fecha, concepto e importe (pueden llamarse distinto o venir separadas en cargo/abono).
- amount SIEMPRE positivo; deduce type: expense si es cargo/negativo, income si es abono/positivo.
- Fechas a YYYY-MM-DD (interpreta formatos dd/mm/aaaa espanoles).
- Limpia el concepto (quita ruido tipo 'COMPRA TARJ. 1234 EN').
- Categoriza cada movimiento con la mejor categoria y una subcategoria concreta util para estudios de gasto.
- Ignora filas de cabecera, saldos y totales; solo movimientos reales.`;

export async function parseBankCsv(csv: string): Promise<ParsedTx[]> {
  const trimmed = csv.split("\n").slice(0, MAX_ROWS + 5).join("\n").slice(0, 60000);

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [parseTool],
    tool_choice: { type: "tool", name: "submit_transactions" },
    messages: [{ role: "user", content: `CSV:\n${trimmed}` }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];

  const out = (block.input as { transactions?: ParsedTx[] }).transactions ?? [];
  return out
    .filter((t) => t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.occurred_at))
    .map((t) => ({
      occurred_at: t.occurred_at,
      description: String(t.description ?? "").slice(0, 200),
      amount: Math.round(Number(t.amount) * 100) / 100,
      type: t.type === "income" ? "income" : "expense",
      category: String(t.category ?? "otros").toLowerCase(),
      subcategory: t.subcategory ? String(t.subcategory).toLowerCase().slice(0, 60) : null,
    }));
}

export async function insertTransactions(rows: ParsedTx[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    occurred_at: r.occurred_at,
    description: r.description,
    amount: r.amount,
    type: r.type,
    category: r.category,
    subcategory: r.subcategory,
    account: "banco",
  }));
  const { error, count } = await supabaseAdmin
    .from("transactions")
    .insert(payload, { count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? rows.length;
}

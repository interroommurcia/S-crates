import { supabaseAdmin } from "@/lib/supabase-server";
import {
  monthRange,
  ensureRecurringForMonth,
  computePropertyReports,
  type Transaction,
} from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refDate = url.searchParams.get("month")
    ? new Date(`${url.searchParams.get("month")}-01T00:00:00Z`)
    : new Date();
  const { from, to } = monthRange(refDate);

  // Materializa gastos fijos (incluidos los de pisos) del mes.
  await ensureRecurringForMonth(refDate.toISOString().slice(0, 7));

  const [props, agg, txs, recs] = await Promise.all([
    supabaseAdmin
      .from("properties")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .then((r) => r.data ?? []),
    computePropertyReports(from, to),
    supabaseAdmin
      .from("transactions")
      .select("*")
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .not("property_id", "is", null)
      .order("occurred_at", { ascending: false })
      .then((r) => (r.data ?? []) as Transaction[]),
    supabaseAdmin
      .from("recurring_expenses")
      .select("*")
      .eq("active", true)
      .not("property_id", "is", null)
      .then((r) => r.data ?? []),
  ]);

  const properties = props.map((p) => {
    const a = agg[p.id] ?? { income: 0, expense: 0, tax: 0 };
    const net = Math.round((a.income - a.expense - a.tax) * 100) / 100;
    return { ...p, income: a.income, expense: a.expense, tax: a.tax, net };
  });

  return Response.json({ properties, transactions: txs, recurring: recs });
}

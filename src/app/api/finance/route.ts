import { supabaseAdmin } from "@/lib/supabase-server";
import {
  computeReport,
  monthRange,
  monthlySeries,
  ensureRecurringForMonth,
  type Transaction,
  type Ledger,
} from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { from, to } = monthRange(
    url.searchParams.get("month")
      ? new Date(`${url.searchParams.get("month")}-01T00:00:00Z`)
      : new Date()
  );

  const refDate = url.searchParams.get("month")
    ? new Date(`${url.searchParams.get("month")}-01T00:00:00Z`)
    : new Date();

  const ledgerParam = url.searchParams.get("ledger");
  const ledger: Ledger | undefined =
    ledgerParam === "personal" || ledgerParam === "empresa" ? ledgerParam : undefined;

  // Genera los gastos fijos de este mes si aun no existen.
  await ensureRecurringForMonth(refDate.toISOString().slice(0, 7));

  let txq = supabaseAdmin
    .from("transactions")
    .select("*")
    .gte("occurred_at", from)
    .lte("occurred_at", to)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (ledger) txq = txq.eq("ledger", ledger);

  const [report, recent, series] = await Promise.all([
    computeReport(from, to, ledger),
    txq.then((r) => (r.data ?? []) as Transaction[]),
    monthlySeries(refDate, 6, ledger),
  ]);

  return Response.json({ report, transactions: recent, series });
}

export async function POST(req: Request) {
  const body = await req.json();
  const amount = Number(body.amount);
  if (!(amount > 0)) return Response.json({ error: "Importe inválido" }, { status: 400 });

  const type: "income" | "expense" | "tax" =
    body.type === "income" ? "income" : body.type === "tax" ? "tax" : "expense";
  const category = String(body.category ?? "otros").trim().toLowerCase() || "otros";
  const subcategory = body.subcategory
    ? String(body.subcategory).trim().toLowerCase() || null
    : null;
  const description = body.description ? String(body.description).trim() || null : null;
  const account = body.account ? String(body.account).trim() || "efectivo" : "efectivo";
  const ledger: Ledger = body.ledger === "empresa" ? "empresa" : "personal";
  const occurred_at =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
  const receipt_path =
    typeof body.receipt_path === "string" && body.receipt_path ? body.receipt_path : null;

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert({ amount, type, category, subcategory, description, account, ledger, occurred_at, receipt_path })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, transaction: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();

  // Borra el PDF adjunto del bucket si existe
  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("receipt_path")
    .eq("id", id)
    .single();
  if (tx?.receipt_path) {
    await supabaseAdmin.storage.from("receipts").remove([tx.receipt_path]);
  }

  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

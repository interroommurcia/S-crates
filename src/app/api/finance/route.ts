import { supabaseAdmin } from "@/lib/supabase-server";
import { computeReport, monthRange, monthlySeries, type Transaction, type Ledger } from "@/lib/finance";

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

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

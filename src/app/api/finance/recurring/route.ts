import { supabaseAdmin } from "@/lib/supabase-server";
import { ensureRecurringForMonth, type Ledger } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ recurring: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const amount = Number(body.amount);
  if (!(amount > 0)) return Response.json({ error: "Importe inválido" }, { status: 400 });

  const type: "expense" | "tax" = body.type === "tax" ? "tax" : "expense";
  const category = String(body.category ?? "otros").trim().toLowerCase() || "otros";
  const subcategory = body.subcategory
    ? String(body.subcategory).trim().toLowerCase() || null
    : null;
  const description = body.description ? String(body.description).trim() || null : null;
  const account = body.account ? String(body.account).trim() || "banco" : "banco";
  const ledger: Ledger = body.ledger === "empresa" ? "empresa" : "personal";
  const day_of_month = Math.min(Math.max(1, Math.round(Number(body.day_of_month) || 1)), 28);

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .insert({ amount, type, category, subcategory, description, account, ledger, day_of_month })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Materializa ya el del mes en curso.
  await ensureRecurringForMonth(new Date().toISOString().slice(0, 7));
  return Response.json({ ok: true, recurring: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  // Borra la plantilla; las transacciones ya generadas se conservan (recurring_id -> null).
  const { error } = await supabaseAdmin.from("recurring_expenses").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

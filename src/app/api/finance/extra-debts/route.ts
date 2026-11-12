import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Actualiza el importe de un pasivo manual (C o P). Solo positivos.
export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const amount = Number(body.amount);
  if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) {
    return Response.json({ error: "Importe inválido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("extra_debts")
    .update({ amount: Math.round(amount * 100) / 100 })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

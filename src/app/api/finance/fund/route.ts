import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Ajusta la base (saldo de partida) del fondo de ahorro activo.
export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const base = Number(body.base_amount);
  if (!Number.isFinite(base) || base < 0) {
    return Response.json({ error: "Importe inválido" }, { status: 400 });
  }

  const { data: fund } = await supabaseAdmin
    .from("savings_funds")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fund) return Response.json({ error: "No hay fondo de ahorro" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("savings_funds")
    .update({ base_amount: Math.round(base * 100) / 100 })
    .eq("id", fund.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

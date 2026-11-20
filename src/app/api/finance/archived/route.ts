import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { Transaction } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista de movimientos archivados, con búsqueda libre por texto
// (categoría, subcategoría, descripción, cuenta — p. ej. una referencia
// catastral guardada en la descripción).
export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  let query = supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("archived", true)
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (q) {
    const safe = q.replace(/[%,]/g, " ");
    query = query.or(
      [
        `description.ilike.%${safe}%`,
        `category.ilike.%${safe}%`,
        `subcategory.ilike.%${safe}%`,
        `account.ilike.%${safe}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ transactions: (data ?? []) as Transaction[] });
}

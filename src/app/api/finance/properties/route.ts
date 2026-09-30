import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ properties: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Falta el nombre" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("properties")
    .insert({ name })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, property: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  // Borra el piso; sus movimientos se conservan (property_id -> null).
  const { error } = await supabaseAdmin.from("properties").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("facts")
    .select("id, content, category, importance, source, created_at")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id?: string };
  if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
  const { error } = await supabaseAdmin.from("facts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

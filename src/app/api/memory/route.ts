import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await supabaseAdmin
    .from("memory")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { content, category } = await req.json();

  const { data, error } = await supabaseAdmin
    .from("memory")
    .insert({ content, category: category || "general" })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await req.json();

  const { error } = await supabaseAdmin.from("memory").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

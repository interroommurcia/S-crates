import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

const MAX_AGE_DAYS = 100;

async function purgeExpired() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from("notes").delete().lt("created_at", cutoff);
}

export async function GET() {
  await purgeExpired();
  const { data, error } = await supabaseAdmin
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  const { content, color } = await req.json();
  const { data, error } = await supabaseAdmin
    .from("notes")
    .insert({ content: content ?? "", color: color || "amber" })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(req: Request) {
  const { id, content, color } = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (content !== undefined) patch.content = content;
  if (color !== undefined) patch.color = color;

  const { data, error } = await supabaseAdmin
    .from("notes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const { error } = await supabaseAdmin.from("notes").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

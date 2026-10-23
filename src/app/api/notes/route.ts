import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Las notas ya no caducan solas. Al borrarlas a mano pasan a la papelera
// (deleted_at) y se purgan definitivamente pasados TRASH_DAYS dias.
const TRASH_DAYS = 3;

async function purgeTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from("notes").delete().not("deleted_at", "is", null).lt("deleted_at", cutoff);
}

export async function GET(req: Request) {
  await purgeTrash();
  const trash = new URL(req.url).searchParams.get("trash") === "1";
  const q = supabaseAdmin.from("notes").select("*");
  const { data, error } = trash
    ? await q.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
    : await q.is("deleted_at", null).order("created_at", { ascending: false });

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
  const { id, content, color, restore } = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (restore) patch.deleted_at = null;
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
  const { id, hard } = await req.json();
  // hard: borrado definitivo. Por defecto, borrado a la papelera (soft).
  const op = hard
    ? supabaseAdmin.from("notes").delete().eq("id", id)
    : supabaseAdmin.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  const { error } = await op;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

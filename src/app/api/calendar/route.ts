import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Borra los eventos ya finalizados (fin < ahora; para tareas sin fin, su inicio).
async function purgePast() {
  const now = new Date().toISOString();
  // ends_at pasado, o (sin ends_at) starts_at pasado.
  await supabaseAdmin.from("calendar_events").delete().lt("ends_at", now);
  await supabaseAdmin
    .from("calendar_events")
    .delete()
    .is("ends_at", null)
    .lt("starts_at", now);
}

export async function GET() {
  await purgePast();
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(500);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const kind: "task" | "meeting" = body.kind === "meeting" ? "meeting" : "task";
  const title = String(body.title ?? "").trim();
  if (!title) return Response.json({ error: "Falta el título" }, { status: 400 });

  const starts_at = typeof body.starts_at === "string" ? new Date(body.starts_at) : null;
  if (!starts_at || isNaN(starts_at.getTime()))
    return Response.json({ error: "Fecha de inicio inválida" }, { status: 400 });

  let ends_at: string | null = null;
  if (typeof body.ends_at === "string" && body.ends_at) {
    const e = new Date(body.ends_at);
    if (!isNaN(e.getTime())) ends_at = e.toISOString();
  }
  const location = body.location ? String(body.location).trim() || null : null;
  const notes = body.notes ? String(body.notes).trim() || null : null;

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .insert({ kind, title, starts_at: starts_at.toISOString(), ends_at, location, notes })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, event: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const { error } = await supabaseAdmin.from("calendar_events").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

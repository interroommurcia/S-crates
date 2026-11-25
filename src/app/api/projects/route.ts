import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";

const UUID = /^[0-9a-f-]{36}$/i;

// Lista de proyectos con el numero de conversaciones de cada uno.
export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  const { data: projects, error } = await supabaseAdmin
    .from("projects")
    .select("id, name, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: convs } = await supabaseAdmin
    .from("conversations")
    .select("project_id")
    .not("project_id", "is", null);

  const counts = new Map<string, number>();
  for (const c of convs ?? []) {
    const pid = (c as { project_id: string }).project_id;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }

  return Response.json(
    (projects ?? []).map((p) => ({ ...p, conversations: counts.get(p.id) ?? 0 }))
  );
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { name } = (await req.json()) as { name?: string };
  const clean = (name ?? "").trim().slice(0, 120);
  if (!clean) return Response.json({ error: "nombre requerido" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ name: clean })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id, name } = (await req.json()) as { id?: string; name?: string };
  const clean = (name ?? "").trim().slice(0, 120);
  if (!id || !UUID.test(id) || !clean)
    return Response.json({ error: "peticion invalida" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("projects")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// Borra el proyecto. Las conversaciones quedan huerfanas (project_id -> null,
// por la FK on delete set null): no se pierde el historial.
export async function DELETE(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = (await req.json()) as { id?: string };
  if (!id || !UUID.test(id))
    return Response.json({ error: "peticion invalida" }, { status: 400 });

  const { error } = await supabaseAdmin.from("projects").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

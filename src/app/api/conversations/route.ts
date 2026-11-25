import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";

const UUID = /^[0-9a-f-]{36}$/i;

type Msg = { role: "user" | "assistant"; content: string };

// GET ?id=<uuid>      -> una conversacion con sus mensajes.
// GET ?project=<uuid> -> lista de conversaciones de ese proyecto (sin mensajes).
// GET (sin params)    -> conversaciones recientes con proyecto (sin mensajes).
export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const project = url.searchParams.get("project");

  if (id) {
    if (!UUID.test(id))
      return Response.json({ error: "id invalido" }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("id, title, project_id, messages, updated_at")
      .eq("id", id)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 404 });
    return Response.json(data);
  }

  let q = supabaseAdmin
    .from("conversations")
    .select("id, title, project_id, updated_at")
    .order("updated_at", { ascending: false });

  if (project) {
    if (!UUID.test(project))
      return Response.json({ error: "project invalido" }, { status: 400 });
    q = q.eq("project_id", project);
  } else {
    q = q.not("project_id", "is", null);
  }

  const { data, error } = await q.limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// Renombra el titulo de una conversacion.
export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id, title } = (await req.json()) as { id?: string; title?: string };
  const clean = (title ?? "").trim().slice(0, 200);
  if (!id || !UUID.test(id) || !clean)
    return Response.json({ error: "peticion invalida" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({ title: clean })
    .eq("id", id)
    .select("id, title, project_id, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = (await req.json()) as { id?: string };
  if (!id || !UUID.test(id))
    return Response.json({ error: "peticion invalida" }, { status: 400 });

  const { error } = await supabaseAdmin.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export type { Msg };

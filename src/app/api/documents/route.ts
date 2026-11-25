import { requireSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { embeddingsEnabled } from "@/lib/embeddings";
import {
  kindFromFile,
  extractText,
  chunkText,
  embedChunks,
} from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const project = new URL(req.url).searchParams.get("project");
  if (!project || !UUID.test(project))
    return Response.json({ error: "project invalido" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, name, kind, bytes, chunks, status, error, created_at")
    .eq("project_id", project)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  if (!embeddingsEnabled())
    return Response.json(
      { error: "Embeddings no configurados (VOYAGE_API_KEY)" },
      { status: 503 }
    );

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "form invalido" }, { status: 400 });

  const projectId = String(form.get("projectId") ?? "");
  const file = form.get("file");
  if (!UUID.test(projectId))
    return Response.json({ error: "projectId invalido" }, { status: 400 });
  if (!(file instanceof File))
    return Response.json({ error: "archivo requerido" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: `El archivo supera ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    );

  const kind = kindFromFile(file.name, file.type);
  if (!kind)
    return Response.json(
      { error: "Formato no soportado (PDF, Word, texto o imagen)" },
      { status: 415 }
    );

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractText(kind, buffer, file.type);
  } catch (e) {
    return Response.json(
      { error: `No se pudo leer el archivo: ${e instanceof Error ? e.message : e}` },
      { status: 422 }
    );
  }

  const chunks = chunkText(text);
  if (chunks.length === 0)
    return Response.json(
      { error: "El archivo no contiene texto legible (¿PDF escaneado?)" },
      { status: 422 }
    );

  let embeddings: number[][];
  try {
    embeddings = await embedChunks(chunks);
  } catch (e) {
    return Response.json(
      { error: `Fallo al generar embeddings: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .insert({
      project_id: projectId,
      name: file.name.slice(0, 200),
      kind,
      bytes: file.size,
      chunks: chunks.length,
      status: "ready",
    })
    .select("id, name, kind, bytes, chunks, status, created_at")
    .single();
  if (docErr || !doc)
    return Response.json({ error: docErr?.message ?? "insert fallo" }, { status: 500 });

  const rows = chunks.map((content, idx) => ({
    document_id: doc.id,
    project_id: projectId,
    idx,
    content,
    embedding: embeddings[idx] as unknown as string,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: cErr } = await supabaseAdmin
      .from("doc_chunks")
      .insert(rows.slice(i, i + 200));
    if (cErr) {
      // Deja el documento marcado como erroneo y limpia trozos parciales.
      await supabaseAdmin.from("documents").update({ status: "error", error: cErr.message }).eq("id", doc.id);
      return Response.json({ error: cErr.message }, { status: 500 });
    }
  }

  // Marca el proyecto como actualizado para que suba en la lista.
  await supabaseAdmin
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  return Response.json(doc);
}

export async function DELETE(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = (await req.json()) as { id?: string };
  if (!id || !UUID.test(id))
    return Response.json({ error: "id invalido" }, { status: 400 });
  const { error } = await supabaseAdmin.from("documents").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

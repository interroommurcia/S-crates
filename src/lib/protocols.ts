import { supabaseAdmin } from "./supabase-server";
import { embed, embeddingsEnabled } from "./embeddings";

const CHUNK_SIZE = 1800; // ~caracteres por chunk
const CHUNK_OVERLAP = 200;
const CONTEXT_BUDGET = 24000; // ~6k tokens de protocolos inyectados como contexto estable

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_SIZE) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function createProtocol(
  title: string,
  content: string
): Promise<{ id: string; chunks: number }> {
  const t = title.trim();
  const chunks = chunkText(content);
  if (!t || chunks.length === 0) throw new Error("titulo o contenido vacio");

  const { data: proto, error } = await supabaseAdmin
    .from("protocols")
    .insert({ title: t })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  let embeddings: number[][] = [];
  if (embeddingsEnabled()) {
    try {
      embeddings = await embed(chunks, "document");
    } catch (e) {
      console.warn("embed protocolo fallo, guardando sin vectores:", e);
    }
  }

  const rows = chunks.map((content, chunk_index) => ({
    protocol_id: proto.id,
    chunk_index,
    content,
    embedding: (embeddings[chunk_index] ?? null) as unknown as string | null,
  }));

  const { error: chunkErr } = await supabaseAdmin.from("protocol_chunks").insert(rows);
  if (chunkErr) throw new Error(chunkErr.message);

  return { id: proto.id, chunks: chunks.length };
}

export async function listProtocols(): Promise<
  { id: string; title: string; created_at: string; chunks: number }[]
> {
  const { data: protos } = await supabaseAdmin
    .from("protocols")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (!protos || protos.length === 0) return [];

  const { data: counts } = await supabaseAdmin
    .from("protocol_chunks")
    .select("protocol_id");

  const byProto: Record<string, number> = {};
  for (const c of counts ?? []) byProto[c.protocol_id] = (byProto[c.protocol_id] ?? 0) + 1;

  return protos.map((p) => ({ ...p, chunks: byProto[p.id] ?? 0 }));
}

export async function deleteProtocol(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("protocols").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Contexto estable inyectado en el system prompt (todos los protocolos, con tope).
export async function getProtocolContext(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("protocols")
    .select("id, title, created_at")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return "";

  const parts: string[] = [];
  let total = 0;
  for (const p of data) {
    const { data: chunks } = await supabaseAdmin
      .from("protocol_chunks")
      .select("content")
      .eq("protocol_id", p.id)
      .order("chunk_index", { ascending: true });
    const body = (chunks ?? []).map((c) => c.content).join("\n");
    const section = `## ${p.title}\n${body}`;
    if (total + section.length > CONTEXT_BUDGET) {
      parts.push(section.slice(0, CONTEXT_BUDGET - total));
      break;
    }
    parts.push(section);
    total += section.length;
  }
  return parts.join("\n\n");
}

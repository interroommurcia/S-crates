import Anthropic from "@anthropic-ai/sdk";
import { extractText as pdfExtract, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { embed, embedOne, embeddingsEnabled } from "./embeddings";
import { supabaseAdmin } from "./supabase-server";

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x20-\x7E]/g, ""),
});

const VISION_MODEL = "claude-haiku-5-5";

export type DocKind = "pdf" | "docx" | "text" | "image";

export function kindFromFile(name: string, mime: string): DocKind | null {
  const n = name.toLowerCase();
  if (mime === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    n.endsWith(".docx")
  )
    return "docx";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(n)) return "image";
  if (mime.startsWith("text/") || /\.(txt|md|markdown|csv)$/.test(n)) return "text";
  return null;
}

// Extrae texto plano del documento. Las imagenes se transcriben con vision
// (una sola llamada barata al subir) para que sean buscables como el resto.
export async function extractText(
  kind: DocKind,
  buffer: Buffer,
  mime: string
): Promise<string> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text) ?? "";
  }
  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value ?? "";
  }
  if (kind === "text") {
    return buffer.toString("utf-8");
  }
  if (kind === "image") {
    const mediaType = (
      mime.startsWith("image/") ? mime : "image/png"
    ) as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    const resp = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Transcribe TODO el texto visible de esta imagen de forma literal. Si no hay texto, describe con detalle su contenido (graficos, diagramas, escenas) para poder buscarlo luego. Responde solo con el contenido, sin preambulos.",
            },
          ],
        },
      ],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
  }
  return "";
}

// Trocea el texto en fragmentos de ~1200 caracteres con solape, respetando
// saltos de parrafo cuando es posible.
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  const paragraphs = clean.split(/\n\n+/);
  let buf = "";
  for (const p of paragraphs) {
    if (buf && buf.length + p.length + 2 > size) {
      chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - overlap));
    }
    // Un parrafo mas largo que size se parte por caracteres.
    if (p.length > size) {
      if (buf.trim()) {
        chunks.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < p.length; i += size - overlap) {
        chunks.push(p.slice(i, i + size).trim());
      }
      continue;
    }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.length > 0);
}

// Recupera los fragmentos mas relevantes de los documentos de un proyecto
// para la consulta dada. Esto es lo que mantiene el coste bajo: solo estos
// trozos (no los documentos enteros) se mandan al modelo.
export async function retrieveRelevantDocs(
  query: string,
  projectId: string,
  limit = 6
): Promise<{ content: string; document_id: string; similarity: number }[]> {
  if (!query.trim() || !projectId || !embeddingsEnabled()) return [];
  try {
    const q = await embedOne(query, "query");
    const { data, error } = await supabaseAdmin.rpc("match_doc_chunks", {
      query_embedding: q as unknown as string,
      p_project_id: projectId,
      match_count: limit,
      min_similarity: 0.2,
    });
    if (error || !data) return [];
    return data as { content: string; document_id: string; similarity: number }[];
  } catch (e) {
    console.warn("retrieveRelevantDocs fallo:", e);
    return [];
  }
}

// Embebe los trozos en lotes (Voyage).
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 96;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const vecs = await embed(chunks.slice(i, i + BATCH), "document");
    out.push(...vecs);
  }
  return out;
}

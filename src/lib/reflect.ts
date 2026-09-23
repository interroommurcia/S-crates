import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { supabaseAdmin } from "./supabase-server";
import { embedOne, embeddingsEnabled } from "./embeddings";

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x20-\x7E]/g, ""),
});

const MODEL = "claude-haiku-4-5-20251001";
const DEDUP_THRESHOLD = 0.88;

type Msg = { role: "user" | "assistant"; content: string };

const reflectionTool: Tool = {
  name: "submit_reflection",
  description: "Entrega el resultado del analisis de la conversacion.",
  input_schema: {
    type: "object",
    properties: {
      episode_summary: {
        type: "string",
        description: "Resumen de 2-4 frases de lo que ocurrio en la conversacion, en tercera persona y en espanol.",
      },
      key_points: {
        type: "array",
        items: { type: "string" },
        description: "Puntos clave o temas tratados (maximo 5).",
      },
      new_facts: {
        type: "array",
        description: "Hechos duraderos NUEVOS sobre el usuario que valga la pena recordar y que NO esten ya en la lista de facts actuales. Vacio si no hay nada nuevo relevante.",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "Hecho autocontenido en tercera persona." },
            category: {
              type: "string",
              enum: ["perfil", "preferencia", "relacion", "trabajo", "salud", "finanzas", "objetivo", "rutina", "general"],
            },
            importance: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["content", "category", "importance"],
        },
      },
      updated_facts: {
        type: "array",
        description: "Facts existentes cuya informacion ha cambiado en esta conversacion. Solo si el cambio es claro. Usa el id exacto de la lista de facts actuales.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string", description: "Nuevo contenido actualizado." },
          },
          required: ["id", "content"],
        },
      },
    },
    required: ["episode_summary", "new_facts"],
  },
};

const REFLECT_SYSTEM = `Analizas una conversacion entre un usuario y su asistente personal para consolidar memoria a largo plazo.

Objetivo: extraer solo hechos DURADEROS y NO TRIVIALES sobre el usuario (perfil, preferencias, relaciones, trabajo, salud, objetivos, rutinas, finanzas) que sirvan para personalizar futuras conversaciones.

Reglas:
- NO propongas facts que ya esten en la lista de "FACTS ACTUALES" (aunque esten redactados distinto). Evita duplicados.
- NO guardes informacion efimera (lo que se hizo hoy, estados de animo puntuales, detalles de una tarea concreta).
- Los movimientos de dinero concretos ya se guardan aparte; no los conviertas en facts salvo que revelen un patron estable ('gasta mucho en restaurantes', 'cobra la nomina el dia 1').
- Propon updated_facts solo si un dato existente cambio de forma clara.
- Redacta en espanol, tercera persona, frases autocontenidas.
- Si no hay nada nuevo relevante, devuelve new_facts vacio.`;

export async function reflectOnConversation(
  conversationId: string
): Promise<{ skipped: boolean; reason?: string; new_facts?: number; updated?: number }> {
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("messages, last_reflected_count")
    .eq("id", conversationId)
    .single();

  if (!conv) return { skipped: true, reason: "conversacion no encontrada" };

  const messages = (conv.messages ?? []) as Msg[];
  const already = conv.last_reflected_count ?? 0;
  if (messages.length <= already) {
    return { skipped: true, reason: "sin mensajes nuevos" };
  }
  if (!messages.some((m) => m.role === "user")) {
    return { skipped: true, reason: "sin turnos de usuario" };
  }

  const { data: existingFacts } = await supabaseAdmin
    .from("facts")
    .select("id, content, category, importance")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(120);

  const factsList =
    (existingFacts ?? [])
      .map((f) => `[${f.id}] (${f.category}) ${f.content}`)
      .join("\n") || "(ninguno)";

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Usuario" : "Socrates"}: ${m.content}`)
    .join("\n");

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      { type: "text", text: REFLECT_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [reflectionTool],
    tool_choice: { type: "tool", name: "submit_reflection" },
    messages: [
      {
        role: "user",
        content: `FACTS ACTUALES:\n${factsList}\n\nCONVERSACION:\n${transcript}`,
      },
    ],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    return { skipped: true, reason: "sin salida estructurada" };
  }

  const out = block.input as {
    episode_summary: string;
    key_points?: string[];
    new_facts: { content: string; category: string; importance: number }[];
    updated_facts?: { id: string; content: string }[];
  };

  let inserted = 0;
  for (const f of out.new_facts ?? []) {
    const content = f.content?.trim();
    if (!content) continue;

    let embedding: number[] | null = null;
    if (embeddingsEnabled()) {
      try {
        embedding = await embedOne(content, "document");
        const { data: dupes } = await supabaseAdmin.rpc("match_facts", {
          query_embedding: embedding as unknown as string,
          match_count: 1,
          min_similarity: DEDUP_THRESHOLD,
        });
        if (Array.isArray(dupes) && dupes.length > 0) continue; // ya existe algo casi igual
      } catch (e) {
        console.warn("dedup embed fallo:", e);
      }
    }

    const { error } = await supabaseAdmin.from("facts").insert({
      content,
      category: f.category ?? "general",
      importance: Math.max(1, Math.min(5, Number(f.importance ?? 3))),
      source: "reflection",
      embedding: embedding as unknown as string | null,
    });
    if (!error) inserted++;
  }

  let updated = 0;
  for (const u of out.updated_facts ?? []) {
    if (!u.id || !u.content?.trim()) continue;
    const patch: Record<string, unknown> = {
      content: u.content,
      updated_at: new Date().toISOString(),
    };
    if (embeddingsEnabled()) {
      try {
        patch.embedding = await embedOne(u.content, "document");
      } catch (e) {
        console.warn("update embed fallo:", e);
      }
    }
    const { error } = await supabaseAdmin.from("facts").update(patch).eq("id", u.id);
    if (!error) updated++;
  }

  if (out.episode_summary?.trim()) {
    let epEmbedding: number[] | null = null;
    if (embeddingsEnabled()) {
      try {
        epEmbedding = await embedOne(out.episode_summary, "document");
      } catch {
        /* opcional */
      }
    }
    const { error: epError } = await supabaseAdmin.from("episodes").upsert(
      {
        conversation_id: conversationId,
        summary: out.episode_summary.trim(),
        key_points: out.key_points ?? [],
        embedding: epEmbedding as unknown as string | null,
      },
      { onConflict: "conversation_id" }
    );
    if (epError) console.error("episode upsert fallo:", epError.message);
  }

  await supabaseAdmin
    .from("conversations")
    .update({ last_reflected_count: messages.length })
    .eq("id", conversationId);

  return { skipped: false, new_facts: inserted, updated };
}

import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { supabaseAdmin } from "./supabase-server";
import { embedOne, embeddingsEnabled } from "./embeddings";

export const tools: Tool[] = [
  {
    name: "remember_fact",
    description:
      "Guarda un hecho nuevo sobre el usuario en la memoria persistente. Usalo cuando el usuario te cuente algo sobre si mismo, sus preferencias, rutinas, personas cercanas, objetivos, o cualquier dato que quieras recordar en futuras conversaciones. No lo uses para datos triviales o efimeros.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "El hecho a recordar, redactado en tercera persona clara y autocontenida (ej: 'Vive en Murcia', 'Prefiere reuniones por la manana', 'Su hermana se llama Ana').",
        },
        category: {
          type: "string",
          enum: ["perfil", "preferencia", "relacion", "trabajo", "salud", "finanzas", "objetivo", "rutina", "general"],
          description: "Categoria del hecho.",
        },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "1 = trivia, 3 = util, 5 = esencial para conocer al usuario.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "search_memory",
    description:
      "Busqueda semantica sobre la memoria persistente. Usalo cuando necesites recordar algo especifico que el usuario te haya contado antes y no aparezca ya en el contexto.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Consulta en lenguaje natural (ej: 'donde vive', 'preferencias de comida', 'sus proyectos actuales').",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Numero maximo de resultados (default 6).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_recent_facts",
    description:
      "Lista los hechos guardados mas recientes, opcionalmente filtrando por categoria. Util cuando el usuario pregunta que sabes de el, o quieres revisar que hay guardado antes de anadir algo nuevo.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filtrar por categoria (opcional).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Numero maximo de resultados (default 15).",
        },
      },
    },
  },
  {
    name: "update_fact",
    description:
      "Actualiza un hecho existente. Usalo cuando la informacion cambie (ej: cambio de trabajo, mudanza) en lugar de crear un duplicado. Necesitas el id que devuelven search_memory o list_recent_facts.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID del fact." },
        content: { type: "string", description: "Nuevo contenido (opcional)." },
        category: { type: "string", description: "Nueva categoria (opcional)." },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Nueva importancia (opcional).",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "forget_fact",
    description:
      "Borra un hecho de la memoria permanentemente. Usalo solo si el usuario pide explicitamente olvidar algo, o si detectas informacion incorrecta u obsoleta que no puedas simplemente actualizar.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID del fact a borrar." },
      },
      required: ["id"],
    },
  },
];

type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "remember_fact":
        return await rememberFact(input);
      case "search_memory":
        return await searchMemory(input);
      case "list_recent_facts":
        return await listRecentFacts(input);
      case "update_fact":
        return await updateFact(input);
      case "forget_fact":
        return await forgetFact(input);
      default:
        return { ok: false, error: `Tool desconocida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function rememberFact(input: Record<string, unknown>): Promise<ToolResult> {
  const content = String(input.content ?? "").trim();
  if (!content) return { ok: false, error: "content vacio" };

  const category = (input.category as string) ?? "general";
  const importance = Math.max(1, Math.min(5, Number(input.importance ?? 3)));

  let embedding: number[] | null = null;
  if (embeddingsEnabled()) {
    try {
      embedding = await embedOne(content, "document");
    } catch (e) {
      console.warn("embed failed, guardando sin vector:", e);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("facts")
    .insert({ content, category, importance, embedding: embedding as unknown as string | null })
    .select("id, content, category, importance, created_at")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function searchMemory(input: Record<string, unknown>): Promise<ToolResult> {
  const query = String(input.query ?? "").trim();
  if (!query) return { ok: false, error: "query vacia" };
  const limit = Math.max(1, Math.min(20, Number(input.limit ?? 6)));

  if (!embeddingsEnabled()) {
    const { data, error } = await supabaseAdmin
      .from("facts")
      .select("id, content, category, importance, created_at")
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { mode: "text_fallback", results: data } };
  }

  const q = await embedOne(query, "query");
  const { data, error } = await supabaseAdmin.rpc("match_facts", {
    query_embedding: q as unknown as string,
    match_count: limit,
    min_similarity: 0.25,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { mode: "semantic", results: data } };
}

async function listRecentFacts(input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.max(1, Math.min(50, Number(input.limit ?? 15)));
  const category = input.category as string | undefined;

  let q = supabaseAdmin
    .from("facts")
    .select("id, content, category, importance, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category) q = q.eq("category", category);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function updateFact(input: Record<string, unknown>): Promise<ToolResult> {
  const id = String(input.id ?? "");
  if (!id) return { ok: false, error: "id vacio" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.content === "string") patch.content = input.content;
  if (typeof input.category === "string") patch.category = input.category;
  if (input.importance !== undefined) {
    patch.importance = Math.max(1, Math.min(5, Number(input.importance)));
  }

  if (typeof input.content === "string" && embeddingsEnabled()) {
    try {
      patch.embedding = await embedOne(input.content, "document");
    } catch (e) {
      console.warn("embed en update fallo:", e);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("facts")
    .update(patch)
    .eq("id", id)
    .select("id, content, category, importance, updated_at")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function forgetFact(input: Record<string, unknown>): Promise<ToolResult> {
  const id = String(input.id ?? "");
  if (!id) return { ok: false, error: "id vacio" };
  const { error } = await supabaseAdmin.from("facts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { deleted: id } };
}

export async function retrieveRelevantFacts(
  query: string,
  limit = 6
): Promise<{ id: string; content: string; category: string; importance: number }[]> {
  if (!query.trim()) return [];

  if (embeddingsEnabled()) {
    try {
      const q = await embedOne(query, "query");
      const { data, error } = await supabaseAdmin.rpc("match_facts", {
        query_embedding: q as unknown as string,
        match_count: limit,
        min_similarity: 0.25,
      });
      if (!error && data) return data as never;
    } catch (e) {
      console.warn("retrieve semantic fallo, usando recientes:", e);
    }
  }

  const { data } = await supabaseAdmin
    .from("facts")
    .select("id, content, category, importance")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as never;
}

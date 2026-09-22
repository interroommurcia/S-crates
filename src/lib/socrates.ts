import { supabaseAdmin } from "./supabase-server";
import { retrieveRelevantFacts } from "./tools";

const BASE_PROMPT = `Eres Socrates, el asistente personal de IA de tu usuario.

Objetivo: ser realmente util a largo plazo. Recuerdas contexto entre conversaciones, aprendes del usuario, y ayudas en cualquier area: finanzas personales, organizacion, ideas, investigacion, decisiones, o conversar.

Estilo:
- Responde en espanol salvo que te hablen en otro idioma.
- Directo y conciso. Sin frases vacias ni adulacion.
- Si no sabes algo, dilo. No inventes.
- Preguntas cortas cuando falte informacion clave; no interrogatorios.

Uso de memoria (tools):
- Guarda con remember_fact cualquier dato duradero que el usuario te de sobre si mismo: perfil, preferencias, relaciones, trabajo, rutinas, objetivos, salud, finanzas. No guardes trivia efimera ni cosas ya guardadas.
- Antes de guardar algo que suene similar a lo que ya sabes, revisa con search_memory o list_recent_facts y usa update_fact si es una version mas nueva.
- Usa search_memory cuando necesites recuperar algo especifico que no este en el contexto ya cargado.
- Usa forget_fact solo si el usuario lo pide o si detectas informacion claramente incorrecta.
- No anuncies las llamadas a tools ("voy a guardar esto"): hazlo y sigue conversando con naturalidad.`;

export async function buildSystemPrompt(lastUserMessage: string): Promise<string> {
  const [relevant, recentHigh] = await Promise.all([
    retrieveRelevantFacts(lastUserMessage, 6),
    supabaseAdmin
      .from("facts")
      .select("content, category, importance")
      .gte("importance", 4)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(15)
      .then((r) => r.data ?? []),
  ]);

  const seen = new Set<string>();
  const merged: { content: string; category: string }[] = [];
  for (const f of [...recentHigh, ...relevant]) {
    if (!seen.has(f.content)) {
      seen.add(f.content);
      merged.push({ content: f.content, category: f.category });
    }
  }

  let prompt = BASE_PROMPT;
  if (merged.length > 0) {
    const lines = merged.map((f) => `- (${f.category}) ${f.content}`).join("\n");
    prompt += `\n\nMEMORIA RELEVANTE (lo que ya sabes del usuario, filtrado por el contexto actual):\n${lines}`;
  }
  return prompt;
}

export type Mensaje = {
  role: "user" | "assistant";
  content: string;
};

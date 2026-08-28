import { supabaseAdmin } from "./supabase-server";

const SYSTEM_PROMPT = `Eres Sócrates, el asistente personal de inteligencia artificial de tu usuario.
Tu objetivo es ser útil, recordar contexto de conversaciones anteriores, y ayudar con cualquier tarea:
finanzas personales, organización, recordatorios, ideas, investigación, o simplemente conversar.

Reglas:
- Responde siempre en español salvo que te hablen en otro idioma.
- Sé directo y conciso. Nada de frases vacías.
- Si no sabes algo, dilo. No inventes.
- Usa el contexto de la memoria para personalizar tus respuestas.
- Si el usuario te da información personal (gustos, rutinas, objetivos), recuérdala para futuras conversaciones.`;

export async function buildSystemPrompt(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("memory")
    .select("content")
    .order("created_at", { ascending: false })
    .limit(50);

  let prompt = SYSTEM_PROMPT;

  if (data && data.length > 0) {
    const memories = data.map((m) => m.content).join("\n- ");
    prompt += `\n\nMEMORIA (cosas que ya sabes del usuario):\n- ${memories}`;
  }

  return prompt;
}

export type Mensaje = {
  role: "user" | "assistant";
  content: string;
};

import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase-server";
import { retrieveRelevantFacts } from "./tools";
import { getProtocolContext } from "./protocols";

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
- No anuncies las llamadas a tools ("voy a guardar esto"): hazlo y sigue conversando con naturalidad.

Contabilidad personal (tools):
- Cuando el usuario mencione un gasto, pago, cobro o ingreso ('gaste 40 en el super', 'me pagaron 1800'), registralo con add_transaction extrayendo importe, tipo y categoria. Confirma brevemente lo registrado.
- Usa spending_report para resumenes ('como voy este mes', 'cuanto llevo gastado') y query_transactions para movimientos concretos.
- Resuelve tu las fechas relativas ('ayer', 'el lunes') a formato YYYY-MM-DD antes de llamar.
- Los importes son en euros.
- Hay dos contabilidades: 'personal' y 'empresa'. Deduce cual por el contexto (material de oficina, clientes, facturas del negocio = empresa; compra del super, ocio = personal). Si es ambiguo y podria ser de empresa, pregunta antes de registrar. Por defecto personal.`;

export async function buildSystemPrompt(
  lastUserMessage: string
): Promise<Anthropic.TextBlockParam[]> {
  const [relevant, stableFacts, protocolContext] = await Promise.all([
    retrieveRelevantFacts(lastUserMessage, 6),
    supabaseAdmin
      .from("facts")
      .select("content, category, importance")
      .gte("importance", 4)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20)
      .then((r) => r.data ?? []),
    getProtocolContext(),
  ]);

  // --- Prefijo ESTABLE (cacheable dentro de una conversacion) ---
  const base = `${BASE_PROMPT}\n\nFecha de hoy: ${new Date().toISOString().slice(0, 10)}.`;
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: base }];

  if (protocolContext) {
    blocks.push({
      type: "text",
      text: `PROTOCOLOS Y CONOCIMIENTO (siguelos siempre que apliquen):\n${protocolContext}`,
    });
  }

  const stableSet = new Set<string>();
  if (stableFacts.length > 0) {
    const lines = stableFacts
      .map((f) => {
        stableSet.add(f.content);
        return `- (${f.category}) ${f.content}`;
      })
      .join("\n");
    blocks.push({
      type: "text",
      text: `LO QUE SABES DEL USUARIO (memoria estable):\n${lines}`,
    });
  }

  // Cache breakpoint tras todo lo estable: tools + base + protocolos + memoria estable.
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };

  // --- Parte VOLATIL (relevante a la consulta actual, fuera de cache) ---
  const extra = relevant.filter((f) => !stableSet.has(f.content));
  if (extra.length > 0) {
    const lines = extra.map((f) => `- (${f.category}) ${f.content}`).join("\n");
    blocks.push({
      type: "text",
      text: `RELEVANTE PARA ESTE MENSAJE:\n${lines}`,
    });
  }

  return blocks;
}

export type Mensaje = {
  role: "user" | "assistant";
  content: string;
};

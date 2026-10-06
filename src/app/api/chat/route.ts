import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { buildSystemPrompt, type Mensaje } from "@/lib/socrates";
import { supabaseAdmin } from "@/lib/supabase-server";
import { tools, runTool } from "@/lib/tools";
import { detectActiveAgent } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x20-\x7E]/g, ""),
});

const MODEL = "claude-haiku-4-5-20251001";
const AGENT_DEFAULT_MODEL = MODEL;
const MAX_TOOL_ITERATIONS = 6;

// Muletillas de estado que se emiten mientras Socrates usa una herramienta
// (p.ej. busca en la web), para que el usuario vea que no se ha quedado pillado.
// Se mandan al cliente con el marcador \u0000S:...\u0000 y no se persisten.
const MULETILLAS = [
  "Mirando hasta el ultimo detalle...",
  "Dejame consultar las fuentes, buen amigo...",
  "Por Zeus, buscando entre los textos...",
  "Examinando lo que dicen las fuentes...",
  "Un momento, que esto merece rigor...",
  "Rastreando los hechos antes de pensarlos...",
  "No quiero fingir lo que no se; buscando...",
  "Consultando el agora, paciencia...",
];

export async function POST(req: Request) {
  try {
    const { messages, conversationId } = (await req.json()) as {
      messages: Mensaje[];
      conversationId?: string;
    };

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const agent = detectActiveAgent(messages);
    const systemPrompt = await buildSystemPrompt(lastUser, agent);
    // web_fetch (leer el documento completo) solo se habilita si el usuario lo
    // pide explicitamente: es lo lento y lo que causaba el timeout de Vercel.
    // Por defecto basta web_search (enlace + fragmento), que es rapido.
    const wantsFullFetch =
      /\b(l[eé]e(lo|la)?|leer|texto\s+completo|contenido\s+completo|documento\s+entero|entero|[ií]ntegro|art[ií]culo\s+completo)\b/i.test(
        lastUser
      );
    const activeTools: Anthropic.Messages.ToolUnion[] = agent?.webSearch
      ? [
          { type: "web_search_20260209", name: "web_search", max_uses: 3 },
          ...(wantsFullFetch
            ? [
                {
                  type: "web_fetch_20260209" as const,
                  name: "web_fetch" as const,
                  max_uses: 2,
                },
              ]
            : []),
        ]
      : agent && !agent.useTools
        ? []
        : tools;
    const activeModel = agent?.model ?? AGENT_DEFAULT_MODEL;
    if (agent) console.log(`[agent] activo: ${agent.id} (modelo ${activeModel})`);

    const convo: MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let assistantText = "";

        try {
          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            const s = anthropic.messages.stream({
              model: activeModel,
              max_tokens: 8192,
              system: systemPrompt,
              tools: activeTools,
              messages: convo,
            });

            for await (const event of s) {
              if (
                event.type === "content_block_start" &&
                (event.content_block.type === "server_tool_use" ||
                  event.content_block.type === "tool_use")
              ) {
                const frase =
                  MULETILLAS[Math.floor(Math.random() * MULETILLAS.length)];
                controller.enqueue(encoder.encode(`\u0000S:${frase}\u0000`));
              }
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                assistantText += event.delta.text;
                controller.enqueue(encoder.encode(event.delta.text));
              }
            }

            const final = await s.finalMessage();
            const u = final.usage;
            console.log(
              `[usage] in=${u.input_tokens} out=${u.output_tokens} cacheWrite=${u.cache_creation_input_tokens ?? 0} cacheRead=${u.cache_read_input_tokens ?? 0}`
            );
            convo.push({ role: "assistant", content: final.content });

            // Las server-tools (web_search/web_fetch) pueden pausar el turno
            // mientras se ejecutan en el servidor: reanudamos reenviando la conversacion.
            if (final.stop_reason === "pause_turn") continue;
            if (final.stop_reason !== "tool_use") break;

            const toolUses = final.content.filter(
              (b): b is ToolUseBlock => b.type === "tool_use"
            );
            const toolResults: ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              const result = await runTool(
                tu.name,
                (tu.input ?? {}) as Record<string, unknown>
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(result),
                is_error: !result.ok,
              });
            }
            convo.push({ role: "user", content: toolResults });
          }

          // Los agentes de dialogo puro (filosofo, con busqueda web) no se
          // persisten: ni transcript ni episodio. Nada de lo buscado queda.
          // Excepcion: si el usuario se identifica como Kike, se persiste de
          // forma transitoria para que el reflect extraiga una nota minima de
          // su postura; el transcript se vacia despues (ver reflect.ts).
          const ephemeralAgent = !!(agent && !agent.useTools);
          const identifiedAsKike = messages.some(
            (m) => m.role === "user" && /\bsoy\s+kike\b/i.test(m.content)
          );
          const skipPersist = ephemeralAgent && !identifiedAsKike;
          if (conversationId && assistantText && !skipPersist) {
            const persisted = [
              ...messages,
              { role: "assistant" as const, content: assistantText },
            ];
            await supabaseAdmin.from("conversations").upsert({
              id: conversationId,
              messages: persisted,
              updated_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error("stream error:", err);
          const msg =
            err instanceof Error ? err.message : "Error desconocido en el modelo";
          controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

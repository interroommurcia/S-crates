import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { buildSystemPrompt, type Mensaje } from "@/lib/socrates";
import { supabaseAdmin } from "@/lib/supabase-server";
import { tools, runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x20-\x7E]/g, ""),
});

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ITERATIONS = 6;

export async function POST(req: Request) {
  try {
    const { messages, conversationId } = (await req.json()) as {
      messages: Mensaje[];
      conversationId?: string;
    };

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const systemPrompt = await buildSystemPrompt(lastUser);

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
              model: MODEL,
              max_tokens: 2048,
              system: systemPrompt,
              tools,
              messages: convo,
            });

            for await (const event of s) {
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

          if (conversationId && assistantText) {
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

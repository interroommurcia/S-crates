import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type Mensaje } from "@/lib/socrates";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const nonAscii = [...apiKey].findIndex((c) => c.charCodeAt(0) > 127);
    if (nonAscii !== -1) {
      return new Response(
        JSON.stringify({
          error: `ANTHROPIC_API_KEY has non-ASCII char at index ${nonAscii} (code ${apiKey.charCodeAt(nonAscii)}). Re-paste the key in Vercel without hidden characters.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages, conversationId } = (await req.json()) as {
      messages: Mensaje[];
      conversationId?: string;
    };

    const systemPrompt = await buildSystemPrompt();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        if (conversationId) {
          const allMessages = [
            ...messages,
            { role: "assistant" as const, content: fullResponse },
          ];
          await supabaseAdmin
            .from("conversations")
            .upsert({
              id: conversationId,
              messages: allMessages,
              updated_at: new Date().toISOString(),
            });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

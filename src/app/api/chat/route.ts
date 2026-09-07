import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type Mensaje } from "@/lib/socrates";
import { supabaseAdmin } from "@/lib/supabase-server";

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
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

import { requireSession } from "@/lib/guard";
import { reflectOnConversation } from "@/lib/reflect";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { conversationId } = (await req.json()) as { conversationId?: string };
    if (!conversationId) {
      return Response.json({ error: "conversationId requerido" }, { status: 400 });
    }
    const result = await reflectOnConversation(conversationId);
    return Response.json(result);
  } catch (error) {
    console.error("reflect error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

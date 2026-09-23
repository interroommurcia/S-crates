import { createProtocol, listProtocols, deleteProtocol } from "@/lib/protocols";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await listProtocols());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { title, content } = (await req.json()) as {
      title?: string;
      content?: string;
    };
    if (!title || !content) {
      return Response.json({ error: "title y content requeridos" }, { status: 400 });
    }
    const result = await createProtocol(title, content);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return Response.json({ error: "id requerido" }, { status: 400 });
    await deleteProtocol(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

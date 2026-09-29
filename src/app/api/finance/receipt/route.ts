import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

const BUCKET = "receipts";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Sube un PDF y devuelve su path en el bucket.
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json({ error: "Solo se admiten PDF" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "El PDF supera los 10 MB" }, { status: 400 });
  }

  const now = new Date();
  const path = `${now.getUTCFullYear()}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, path });
}

// Redirige a una URL firmada temporal para ver/descargar el PDF.
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return Response.json({ error: "Falta path" }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data) return Response.json({ error: error?.message ?? "No encontrado" }, { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}

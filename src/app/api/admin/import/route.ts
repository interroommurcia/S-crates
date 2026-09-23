import { parseBankCsv, insertTransactions, type ParsedTx } from "@/lib/import-csv";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      csv?: string;
      rows?: ParsedTx[];
      commit?: boolean;
    };

    // Paso 2: confirmar e insertar filas ya revisadas
    if (body.commit && Array.isArray(body.rows)) {
      const inserted = await insertTransactions(body.rows);
      return Response.json({ inserted });
    }

    // Paso 1: parsear + categorizar (preview, sin insertar)
    if (!body.csv || body.csv.trim().length < 10) {
      return Response.json({ error: "CSV vacío" }, { status: 400 });
    }
    const rows = await parseBankCsv(body.csv);
    return Response.json({ rows });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5-lite";
const DIM = 1024;

function apiKey(): string | null {
  const k = process.env.VOYAGE_API_KEY;
  return k ? k.replace(/[^\x20-\x7E]/g, "") : null;
}

export function embeddingsEnabled(): boolean {
  return apiKey() !== null;
}

export async function embed(
  input: string | string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  const key = apiKey();
  if (!key) throw new Error("VOYAGE_API_KEY no configurada");

  const inputs = Array.isArray(input) ? input : [input];
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: inputs,
      input_type: inputType,
      output_dimension: DIM,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return json.data.map((d) => d.embedding);
}

export async function embedOne(
  input: string,
  inputType: "document" | "query" = "document"
): Promise<number[]> {
  const [v] = await embed(input, inputType);
  return v;
}

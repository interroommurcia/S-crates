import { requireSession } from "@/lib/guard";
import { computeRatios, monthRange } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") === "month" ? "month" : "global";
  const monthParam = params.get("month");
  const ref = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date();
  const { from, to } = monthRange(ref);

  const ratios = await computeRatios(from, to, scope);
  return Response.json(ratios);
}

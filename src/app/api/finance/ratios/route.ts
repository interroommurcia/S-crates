import { requireSession } from "@/lib/guard";
import { computeRatios, monthRange } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const monthParam = new URL(req.url).searchParams.get("month");
  const ref = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date();
  const { from, to } = monthRange(ref);

  const ratios = await computeRatios(from, to);
  return Response.json(ratios);
}

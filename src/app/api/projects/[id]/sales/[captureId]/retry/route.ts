import { bad, handle, json, keyOf } from "@/lib/http";
import { access } from "@/lib/projects";
import { retrySale } from "@/lib/settle";

export async function POST(req: Request, ctx: { params: Promise<{ id: string; captureId: string }> }) {
  return handle(async () => {
    const { id, captureId } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("Only the account owner's link can retry a held sale.", 403);
    return json({ sale: await retrySale(id, captureId) });
  });
}

import { z } from "zod";
import { bad, handle, json, keyOf } from "@/lib/http";
import { access } from "@/lib/projects";
import { saveProject } from "@/lib/store";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("Only the account owner's link can change limits.", 403);
    const b = z.object({ daily_limit_cents: z.number().int().min(0).max(Number(process.env.MAX_DAILY_PAYOUT_CENTS || 30000)) }).safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("Limit must be between $0 and the server maximum.");
    a.project.daily_limit_cents = b.data.daily_limit_cents;
    await saveProject(a.project);
    return json({ daily_limit_cents: a.project.daily_limit_cents });
  });
}

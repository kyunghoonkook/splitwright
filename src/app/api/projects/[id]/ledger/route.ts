import { bad, handle, json, keyOf } from "@/lib/http";
import { access } from "@/lib/projects";
import { listSales } from "@/lib/store";
import { refreshPending, salesTotals } from "@/lib/views";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("This link is not valid for this project.", 403);
    const sales = await refreshPending(await listSales(id, 300));
    return json({ project: { id: a.project.id, name: a.project.name, owner_id: a.project.owner_id, members: a.project.members.map((m) => ({ id: m.id, name: m.name, color: m.color })) }, sales, totals: salesTotals(a.project, sales) });
  });
}

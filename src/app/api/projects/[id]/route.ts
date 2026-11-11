import { bad, handle, json, keyOf } from "@/lib/http";
import { access, publicProject } from "@/lib/projects";
import { projectOverview, refreshPending } from "@/lib/views";
import { listSales } from "@/lib/store";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("This link is not valid for this project.", 403);
    await refreshPending(await listSales(id, 20));
    return json({ project: publicProject(a.project, { role: a.role, member_id: a.member.id }), ...(await projectOverview(a.project)) });
  });
}

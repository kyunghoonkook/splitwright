import { bad, handle, json, keyOf } from "@/lib/http";
import { access } from "@/lib/projects";
import { previewFor } from "@/lib/views";
import { rulesProblems } from "@/lib/engine";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("This link is not valid for this project.", 403);
    const rules = a.project.draft?.rules;
    if (!rules) return bad("No deal yet");
    const problems = rulesProblems(rules, a.project.members);
    if (problems.length) return json({ problems });
    return json({ problems: [], ...previewFor(rules, a.project) });
  });
}

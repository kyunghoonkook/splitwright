import { z } from "zod";
import { bad, handle, json, keyOf } from "@/lib/http";
import { access, publicProject } from "@/lib/projects";
import { compileDeal, deriveQuestions } from "@/lib/deal";
import { saveProject } from "@/lib/store";
import { dropPending } from "@/lib/pending";

const Body = z.object({ source_text: z.string().min(10).max(3000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("Only the account owner's link can edit the deal.", 403);
    const b = Body.safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("Write the deal in a sentence or two first.");
    const p = a.project;
    try {
      const out = await compileDeal(b.data.source_text, p.members, p.owner_id, p.product.price_cents);
      p.draft = {
        source_text: b.data.source_text,
        rules: out.rules,
        quotes: out.quotes,
        questions: deriveQuestions(out.rules, p.members, p.owner_id, p.product.price_cents, out.wording),
        compiled_by: "gemini",
        model: out.model,
        notes: out.notes,
        updated_at: new Date().toISOString(),
      };
    } catch (e) {
      return json({ error: `The model could not read this deal right now (${e instanceof Error ? e.message : e}). You can fill the rules in by hand below.`, fallback: true }, 503);
    }
    await dropPending(p);
    await saveProject(p);
    return json({ project: publicProject(p, { role: "lead", member_id: a.member.id }) });
  });
}

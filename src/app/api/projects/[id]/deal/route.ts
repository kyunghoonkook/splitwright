import { z } from "zod";
import { bad, handle, json, keyOf } from "@/lib/http";
import { access, publicProject } from "@/lib/projects";
import { applyAnswer, deriveQuestions, emptyDraft } from "@/lib/deal";
import { saveProject } from "@/lib/store";
import { dropPending } from "@/lib/pending";
import type { Rules } from "@/lib/types";

const RulesZ = z.object({
  basis: z.enum(["net_after_paypal_fee", "gross"]).nullable(),
  tiers: z.array(
    z.union([
      z.object({ type: z.literal("recoup"), payee: z.string(), amount_cents: z.number().int().positive() }),
      z.object({
        type: z.literal("split"),
        shares: z.array(z.object({ payee: z.string(), bps: z.number().int().min(0).max(10000) })),
        caps: z.array(z.object({ payee: z.string(), cap_cents: z.number().int().positive(), overflow: z.enum(["pro_rata", "owner"]).nullable() })),
      }),
    ]),
  ).max(6),
});
const Body = z.object({
  source_text: z.string().max(3000).optional(),
  rules: RulesZ.optional(),
  answer: z.object({ question_id: z.string(), value: z.string() }).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("Only the account owner's link can edit the deal.", 403);
    const b = Body.safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("That edit is not valid: " + b.error.issues[0]?.message);
    const p = a.project;
    const d = p.draft ?? emptyDraft();
    const ids = new Set(p.members.map((m) => m.id));
    if (b.data.source_text !== undefined) d.source_text = b.data.source_text;
    if (b.data.rules) {
      const r = b.data.rules as Rules;
      if (r.tiers.some((t) => (t.type === "recoup" ? !ids.has(t.payee) : t.shares.some((s) => !ids.has(s.payee))))) return bad("Every rule must name someone on the team.");
      d.rules = r;
      if (d.compiled_by === "none") d.compiled_by = "manual";
      const answered = d.questions.filter((q) => q.answer);
      d.questions = [...answered, ...deriveQuestions(d.rules, p.members, p.owner_id, p.product.price_cents, {}, d.questions).filter((q) => !answered.some((x) => x.id === q.id))];
    }
    if (b.data.answer) {
      const q = d.questions.find((x) => x.id === b.data.answer!.question_id);
      if (!q) return bad("Unknown question");
      if (!q.options.some((o) => o.value === b.data.answer!.value)) return bad("Pick one of the offered answers");
      d.rules = applyAnswer(d.rules, q.field, b.data.answer.value, p.owner_id);
      q.answer = b.data.answer.value;
      // new gaps can appear (e.g. scaling shares); add them, keep answered ones
      const fresh = deriveQuestions(d.rules, p.members, p.owner_id, p.product.price_cents, {}, d.questions);
      d.questions = [...d.questions.filter((x) => x.answer), ...fresh.filter((f) => !d.questions.some((x) => x.id === f.id && x.answer))];
    }
    d.updated_at = new Date().toISOString();
    p.draft = d;
    await dropPending(p);
    await saveProject(p);
    return json({ project: publicProject(p, { role: "lead", member_id: a.member.id }) });
  });
}

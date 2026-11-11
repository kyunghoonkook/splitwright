import { bad, handle, json, keyOf } from "@/lib/http";
import { access, publicProject } from "@/lib/projects";
import { aiSummary, versionOf } from "@/lib/deal";
import { engineSummary, rulesProblems, simulate } from "@/lib/engine";
import { getRuleSet, saveProject, saveRuleSet } from "@/lib/store";
import type { RuleSet } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await access(id, keyOf(req));
    if (!a || a.role !== "lead") return bad("Only the account owner's link can send the rules for signatures.", 403);
    const p = a.project;
    const d = p.draft;
    if (!d) return bad("No deal yet");
    const problems = rulesProblems(d.rules, p.members);
    if (problems.length) return bad(`Answer the open questions first: ${problems.join("; ")}`);
    if (d.questions.some((q) => !q.answer)) return bad("Answer the open questions first.");
    const members = p.members.map((m) => ({ id: m.id, name: m.name, paypal_email: m.paypal_email }));
    const version = versionOf(d.rules, members);
    if (p.active_version === version) return bad("These exact rules are already active.");
    const existing = await getRuleSet(p.id, version);
    if (existing && existing.status === "awaiting_signatures") {
      p.pending_version = version;
      await saveProject(p);
      return json({ project: publicProject(p, { role: "lead", member_id: a.member.id }), ruleset: existing });
    }
    const allocMembers = p.members.map((m) => ({ id: m.id, name: m.name }));
    let summary = engineSummary(d.rules, allocMembers, p.owner_id);
    let summary_by: RuleSet["summary_by"] = "engine";
    try {
      const sim = simulate({ rules: d.rules, members: allocMembers, owner_id: p.owner_id, price_cents: p.product.price_cents, count: 3 });
      const s = await aiSummary(d.rules, p.members, p.owner_id, sim.rows.map((r) => r.steps.join(" ")));
      summary = s.lines;
      summary_by = "gemini";
    } catch {
      /* the code-written summary is used */
    }
    const rs: RuleSet = {
      version,
      project_id: p.id,
      source_text: d.source_text,
      rules: d.rules,
      summary,
      summary_by,
      members,
      owner_id: p.owner_id,
      status: "awaiting_signatures",
      signatures: [],
      created_at: new Date().toISOString(),
    };
    await saveRuleSet(rs);
    p.pending_version = version;
    await saveProject(p);
    return json({ project: publicProject(p, { role: "lead", member_id: a.member.id }), ruleset: rs });
  });
}

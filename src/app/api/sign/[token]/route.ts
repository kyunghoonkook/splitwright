import { bad, handle, json } from "@/lib/http";
import { byToken } from "@/lib/projects";
import { getRuleSet, saveProject, saveRuleSet } from "@/lib/store";
import { engineSummary, simulate } from "@/lib/engine";

async function load(token: string) {
  const a = await byToken(token);
  if (!a) return null;
  const v = a.project.pending_version ?? a.project.active_version;
  const rs = v ? await getRuleSet(a.project.id, v) : null;
  return { ...a, rs };
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const { token } = await ctx.params;
    const a = await load(token);
    if (!a) return bad("This link is not valid.", 404);
    const { project: p, rs } = a;
    const members = p.members.map((m) => ({ id: m.id, name: m.name }));
    const sim = rs ? simulate({ rules: rs.rules, members, owner_id: p.owner_id, price_cents: p.product.price_cents, count: 60 }) : null;
    return json({
      project: { id: p.id, name: p.name, product: p.product, owner_id: p.owner_id, members: p.members.map((m) => ({ id: m.id, name: m.name, color: m.color })) },
      me: { id: a.member.id, name: a.member.name, paypal_email: a.member.paypal_email },
      ruleset: rs,
      engine_summary: rs ? engineSummary(rs.rules, members, p.owner_id) : [],
      preview: sim,
    });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const { token } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const a = await load(token);
    if (!a) return bad("This link is not valid.", 404);
    const { project: p, rs, member } = a;
    if (!rs || rs.status !== "awaiting_signatures" || p.pending_version !== rs.version) return bad("There is nothing waiting for your signature.");
    if (body.version !== rs.version) return bad("The rules changed after you opened this page. Reload and read them again.", 409);
    if (!rs.signatures.some((s) => s.member_id === member.id)) rs.signatures.push({ member_id: member.id, signed_at: new Date().toISOString() });
    if (rs.members.every((m) => rs.signatures.some((s) => s.member_id === m.id))) {
      if (p.active_version) {
        const old = await getRuleSet(p.id, p.active_version);
        if (old) {
          old.status = "superseded";
          await saveRuleSet(old);
        }
      }
      rs.status = "active";
      rs.activated_at = new Date().toISOString();
      p.active_version = rs.version;
      p.pending_version = null;
      await saveProject(p);
    }
    await saveRuleSet(rs);
    return json({ ruleset: rs });
  });
}

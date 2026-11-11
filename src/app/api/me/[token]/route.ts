import { bad, handle, json } from "@/lib/http";
import { byToken } from "@/lib/projects";
import { getRuleSet, getState, listSales } from "@/lib/store";
import { refreshPending, salesTotals } from "@/lib/views";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const { token } = await ctx.params;
    const a = await byToken(token);
    if (!a) return bad("This link is not valid.", 404);
    const p = a.project;
    const sales = await refreshPending(await listSales(p.id, 300));
    const rs = p.active_version ? await getRuleSet(p.id, p.active_version) : null;
    const state = rs ? await getState(`${p.id}:${rs.version}`) : null;
    const progress: { label: string; done_cents: number; of_cents: number }[] = [];
    if (rs && state) {
      rs.rules.tiers.forEach((t, i) => {
        if (t.type === "recoup" && t.payee === a.member.id) progress.push({ label: "Paid back so far", done_cents: state.recouped[String(i)] ?? 0, of_cents: t.amount_cents });
        if (t.type === "split") t.caps.filter((c) => c.payee === a.member.id).forEach((c) => progress.push({ label: "Toward your cap", done_cents: state.capped[`${i}:${c.payee}`] ?? 0, of_cents: c.cap_cents }));
      });
    }
    const lines = sales.flatMap((s) => s.lines.filter((l) => l.member_id === a.member.id).map((l) => ({ ...l, captured_at: s.captured_at, gross_cents: s.gross_cents, fee_cents: s.fee_cents, sale_status: s.status, hold_reason: s.hold_reason, steps: s.steps, rules_version: s.rules_version })));
    return json({
      project: { id: p.id, name: p.name, product: p.product, owner_id: p.owner_id, members: p.members.map((m) => ({ id: m.id, name: m.name, color: m.color })) },
      me: { id: a.member.id, name: a.member.name, paypal_email: a.member.paypal_email, is_owner: a.member.id === p.owner_id },
      ruleset: rs ? { version: rs.version, summary: rs.summary, status: rs.status } : null,
      pending_version: p.pending_version,
      sign_link: p.pending_version ? `/sign/${token}` : null,
      totals: salesTotals(p, sales).per_member[a.member.id],
      progress,
      lines,
    });
  });
}

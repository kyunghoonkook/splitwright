// Read models shared by several routes.
import { simulate, engineSummary } from "./engine";
import { getPaidToday, getRuleSet, listSales, today } from "./store";
import type { Project, RuleSet, Sale } from "./types";
import { refreshBatch } from "./settle";

export async function projectOverview(p: Project) {
  const [active, pending] = await Promise.all([p.active_version ? getRuleSet(p.id, p.active_version) : null, p.pending_version ? getRuleSet(p.id, p.pending_version) : null]);
  const sales = await listSales(p.id, 300);
  const totals = salesTotals(p, sales);
  return { active, pending, totals, recent: sales.slice(0, 8), paid_today_cents: await getPaidToday(p.id, today()), daily_limit_cents: Math.min(Number(process.env.MAX_DAILY_PAYOUT_CENTS || 30000), p.daily_limit_cents ?? Infinity), max_item_cents: Number(process.env.MAX_PAYOUT_ITEM_CENTS || 5000) };
}

export function salesTotals(p: Project, sales: Sale[]) {
  const per: Record<string, { earned: number; sent: number; pending: number; held: number }> = {};
  p.members.forEach((m) => (per[m.id] = { earned: 0, sent: 0, pending: 0, held: 0 }));
  let gross = 0,
    fees = 0,
    held = 0;
  for (const s of sales) {
    gross += s.gross_cents;
    fees += s.fee_cents;
    if (s.status === "held") held += 1;
    for (const l of s.lines) {
      const t = per[l.member_id];
      if (!t) continue;
      if (l.status === "held") t.held += l.amount_cents;
      else {
        t.earned += l.amount_cents;
        if (l.status === "succeeded") t.sent += l.amount_cents;
        if (l.status === "pending") t.pending += l.amount_cents;
      }
    }
  }
  const sent = Object.values(per).reduce((a, t) => a + t.sent, 0);
  return { sales: sales.length, gross_cents: gross, fee_cents: fees, sent_cents: sent, held_sales: held, per_member: per };
}

export async function refreshPending(sales: Sale[]) {
  const stale = sales.filter((s) => s.payout_batch_id && s.lines.some((l) => l.status === "pending"));
  await Promise.all(stale.slice(0, 10).map((s) => refreshBatch(s).catch(() => s)));
  return sales;
}

export function previewFor(rules: RuleSet["rules"], p: Project, count = 160) {
  const members = p.members.map((m) => ({ id: m.id, name: m.name }));
  const sim = simulate({ rules, members, owner_id: p.owner_id, price_cents: p.product.price_cents, count });
  return { ...sim, engine_summary: sim.error ? [] : engineSummary(rules, members, p.owner_id) };
}

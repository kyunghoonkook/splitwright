// The split engine. Plain code, no AI. It is the only place that produces amounts.
import type { EngineState, Rules, Tier } from "./types";

export const usd = (c: number) => {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

// Rough PayPal fee used only for previews. Real sales use the fee PayPal reports on the capture.
export const estimateFee = (gross: number) => Math.round(gross * 0.0349) + 49;

export interface PartOut {
  tier_index: number;
  tier_type: "recoup" | "split" | "overflow" | "fee" | "remainder";
  amount_cents: number;
}

export interface AllocMember {
  id: string;
  name: string;
}

export interface AllocResult {
  ok: boolean;
  error?: string;
  split_base_cents: number;
  per_member: Record<string, { amount_cents: number; parts: PartOut[] }>;
  state: EngineState;
  steps: string[];
  events: string[]; // e.g. "recoup:0:done", "cap:1:sol"
}

export function emptyState(): EngineState {
  return { recouped: {}, capped: {} };
}

export function rulesProblems(rules: Rules, members: AllocMember[]): string[] {
  const ids = new Set(members.map((m) => m.id));
  const out: string[] = [];
  if (rules.basis !== "gross" && rules.basis !== "net_after_paypal_fee") out.push("basis is not decided");
  if (!rules.tiers.length) out.push("no tiers");
  rules.tiers.forEach((t, i) => {
    if (t.type === "recoup") {
      if (!ids.has(t.payee)) out.push(`tier ${i + 1}: unknown payee`);
      if (!Number.isInteger(t.amount_cents) || t.amount_cents <= 0) out.push(`tier ${i + 1}: recoup amount must be positive`);
    } else {
      const sum = t.shares.reduce((a, s) => a + s.bps, 0);
      if (sum !== 10000) out.push(`tier ${i + 1}: shares add up to ${pct(sum)}, not 100%`);
      t.shares.forEach((s) => {
        if (!ids.has(s.payee)) out.push(`tier ${i + 1}: unknown payee`);
        if (!Number.isInteger(s.bps) || s.bps < 0) out.push(`tier ${i + 1}: share must be a whole number of basis points`);
      });
      t.caps.forEach((c) => {
        if (!t.shares.some((s) => s.payee === c.payee)) out.push(`tier ${i + 1}: cap on someone without a share`);
        if (!Number.isInteger(c.cap_cents) || c.cap_cents <= 0) out.push(`tier ${i + 1}: cap must be positive`);
        if (c.overflow !== "pro_rata" && c.overflow !== "owner") out.push(`tier ${i + 1}: what happens above the cap is not decided`);
      });
      if (i !== rules.tiers.length - 1) out.push(`tier ${i + 1}: a percentage split must be the last tier`);
    }
  });
  return out;
}

/**
 * Split one captured sale.
 * Invariant: the sum of every member's amount equals gross - fee (what actually reached the account).
 */
export function allocate(args: {
  gross_cents: number;
  fee_cents: number;
  rules: Rules;
  members: AllocMember[];
  owner_id: string;
  state: EngineState;
}): AllocResult {
  const { gross_cents: gross, fee_cents: fee, rules, members, owner_id } = args;
  const state: EngineState = {
    recouped: { ...args.state.recouped },
    capped: { ...args.state.capped },
  };
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const per: AllocResult["per_member"] = {};
  members.forEach((m) => (per[m.id] = { amount_cents: 0, parts: [] }));
  const add = (id: string, p: PartOut) => {
    if (p.amount_cents === 0) return;
    per[id].amount_cents += p.amount_cents;
    per[id].parts.push(p);
  };
  const steps: string[] = [];
  const events: string[] = [];
  const fail = (error: string): AllocResult => ({ ok: false, error, split_base_cents: 0, per_member: per, state: args.state, steps, events });

  const problems = rulesProblems(rules, members);
  if (problems.length) return fail(`Rules are not complete: ${problems.join("; ")}`);
  if (!Number.isInteger(gross) || !Number.isInteger(fee) || gross <= 0 || fee < 0 || fee > gross) return fail("Sale amounts are not valid");

  const net = gross - fee;
  const base = rules.basis === "gross" ? gross : net;
  steps.push(`Sale ${usd(gross)}, PayPal fee ${usd(fee)}, ${usd(net)} reached the account.`);
  steps.push(rules.basis === "gross" ? `Split is on the full price ${usd(base)}; the fee comes out of ${name(owner_id)}'s part.` : `Split is on ${usd(base)} after PayPal's fee.`);

  let pool = base;
  rules.tiers.forEach((tier: Tier, i) => {
    if (pool <= 0) return;
    if (tier.type === "recoup") {
      const done = state.recouped[String(i)] ?? 0;
      const owed = Math.max(0, tier.amount_cents - done);
      if (owed === 0) {
        steps.push(`${name(tier.payee)}'s ${usd(tier.amount_cents)} is already paid back.`);
        return;
      }
      const take = Math.min(owed, pool);
      add(tier.payee, { tier_index: i, tier_type: "recoup", amount_cents: take });
      state.recouped[String(i)] = done + take;
      pool -= take;
      steps.push(`${name(tier.payee)}'s ${usd(tier.amount_cents)} payback had ${usd(owed)} left: ${usd(take)} to ${name(tier.payee)}${take === owed ? " (now fully paid back)" : ""}.`);
      if (take === owed) events.push(`recoup:${i}:done`);
      return;
    }
    // percentage split with optional caps
    const tierPool = pool;
    const order = tier.shares.map((s) => s.payee);
    const exact: Record<string, number> = {};
    order.forEach((p) => (exact[p] = 0));
    let ownerOverflow = 0;
    let active = tier.shares.filter((s) => s.bps > 0);
    let remaining = tierPool;
    const capLeft = (p: string) => {
      const c = tier.caps.find((x) => x.payee === p);
      if (!c) return Infinity;
      return Math.max(0, c.cap_cents - (state.capped[`${i}:${p}`] ?? 0));
    };
    const capNotes: string[] = [];
    for (let guard = 0; guard < 20 && remaining > 1e-9; guard++) {
      const total = active.reduce((a, s) => a + s.bps, 0);
      if (total === 0) break;
      const tentative = active.map((s) => ({ s, v: (remaining * s.bps) / total }));
      const over = tentative.filter((t) => t.v > capLeft(t.s.payee) + 1e-9);
      if (!over.length) {
        tentative.forEach((t) => (exact[t.s.payee] += t.v));
        remaining = 0;
        break;
      }
      for (const t of over) {
        const give = capLeft(t.s.payee);
        exact[t.s.payee] += give;
        const excess = t.v - give;
        const cap = tier.caps.find((c) => c.payee === t.s.payee)!;
        remaining -= give;
        if (cap.overflow === "owner") {
          ownerOverflow += excess;
          remaining -= excess;
        }
        capNotes.push(`${name(t.s.payee)} reached the ${usd(cap.cap_cents)} cap; the rest of that share goes ${cap.overflow === "owner" ? `to ${name(owner_id)}` : "to the others by their percentages"}.`);
        events.push(`cap:${i}:${t.s.payee}`);
      }
      active = active.filter((s) => !over.some((o) => o.s.payee === s.payee));
    }
    if (remaining > 1e-9) ownerOverflow += remaining; // everyone capped

    // round to cents: floor, then hand out leftover cents by largest fraction, ties by member order
    const ids = [...order];
    const hasOwner = ownerOverflow > 0;
    if (hasOwner && !ids.includes(owner_id)) ids.push(owner_id);
    const raw: Record<string, number> = {};
    ids.forEach((p) => (raw[p] = (exact[p] ?? 0)));
    const ownerRawSplit = raw[owner_id] ?? 0;
    raw[owner_id] = ownerRawSplit + ownerOverflow;
    const floor: Record<string, number> = {};
    ids.forEach((p) => (floor[p] = Math.floor(raw[p] + 1e-9)));
    let left = tierPool - ids.reduce((a, p) => a + floor[p], 0);
    const byFrac = [...ids].sort((a, b) => raw[b] - floor[b] - (raw[a] - floor[a]) || ids.indexOf(a) - ids.indexOf(b));
    for (const p of byFrac) {
      if (left <= 0) break;
      if (capLeft(p) !== Infinity && floor[p] + 1 > capLeft(p) && p !== owner_id) continue;
      floor[p] += 1;
      left -= 1;
    }
    if (left !== 0) floor[owner_id] = (floor[owner_id] ?? 0) + left;

    const shareTxt: string[] = [];
    ids.forEach((p) => {
      let amt = floor[p];
      if (p === owner_id && ownerOverflow > 0) {
        const ov = Math.min(amt, Math.round(ownerOverflow));
        const splitPart = amt - ov;
        add(p, { tier_index: i, tier_type: "split", amount_cents: splitPart });
        add(p, { tier_index: i, tier_type: "overflow", amount_cents: ov });
        if (splitPart) shareTxt.push(`${name(p)} ${usd(splitPart)}`);
        if (ov) shareTxt.push(`${name(p)} +${usd(ov)} above others' caps`);
      } else {
        add(p, { tier_index: i, tier_type: "split", amount_cents: amt });
        const s = tier.shares.find((x) => x.payee === p);
        shareTxt.push(`${name(p)} ${s ? pct(s.bps) + " " : ""}${usd(amt)}`);
      }
      if (tier.caps.some((c) => c.payee === p)) state.capped[`${i}:${p}`] = (state.capped[`${i}:${p}`] ?? 0) + floor[p];
      amt = 0;
    });
    steps.push(`Remaining ${usd(tierPool)} split: ${shareTxt.join(", ")}.`);
    capNotes.forEach((n) => steps.push(n));
    pool = 0;
  });

  if (pool > 0) {
    add(owner_id, { tier_index: -1, tier_type: "remainder", amount_cents: pool });
    steps.push(`${usd(pool)} not covered by any rule stays with ${name(owner_id)}.`);
  }
  if (rules.basis === "gross" && fee > 0) {
    per[owner_id].amount_cents -= fee;
    per[owner_id].parts.push({ tier_index: -1, tier_type: "fee", amount_cents: -fee });
    steps.push(`PayPal's ${usd(fee)} fee comes out of ${name(owner_id)}'s part.`);
  }

  const sum = Object.values(per).reduce((a, m) => a + m.amount_cents, 0);
  if (sum !== net) return fail(`Shares add up to ${usd(sum)} but ${usd(net)} arrived. Nothing was sent.`);
  const negative = Object.entries(per).find(([, m]) => m.amount_cents < 0);
  if (negative) return fail(`${name(negative[0])}'s part would be negative after the fee. Nothing was sent.`);

  return { ok: true, split_base_cents: base, per_member: per, state, steps, events };
}

export interface SimRow {
  n: number;
  gross_cents: number;
  fee_cents: number;
  per: Record<string, number>;
  cumulative: Record<string, number>;
  events: string[];
  steps: string[];
}

export function simulate(args: { rules: Rules; members: AllocMember[]; owner_id: string; price_cents: number; count: number; state?: EngineState }): { rows: SimRow[]; error?: string } {
  let state = args.state ?? emptyState();
  const rows: SimRow[] = [];
  const cumulative: Record<string, number> = {};
  args.members.forEach((m) => (cumulative[m.id] = 0));
  for (let n = 1; n <= args.count; n++) {
    const fee = estimateFee(args.price_cents);
    const r = allocate({ gross_cents: args.price_cents, fee_cents: fee, rules: args.rules, members: args.members, owner_id: args.owner_id, state });
    if (!r.ok) return { rows, error: r.error };
    state = r.state;
    const per: Record<string, number> = {};
    args.members.forEach((m) => {
      per[m.id] = r.per_member[m.id].amount_cents;
      cumulative[m.id] += per[m.id];
    });
    rows.push({ n, gross_cents: args.price_cents, fee_cents: fee, per, cumulative: { ...cumulative }, events: r.events, steps: r.steps });
  }
  return { rows };
}

// Plain-language summary written by code. Always available, even without the model.
export function engineSummary(rules: Rules, members: AllocMember[], owner_id: string): string[] {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const out: string[] = [];
  out.push(rules.basis === "gross" ? `Everything is split on the full sale price. PayPal's fee comes out of ${name(owner_id)}'s part.` : "Everything is split on what is left after PayPal's fee.");
  rules.tiers.forEach((t, i) => {
    const first = i === 0 ? "First" : "Then";
    if (t.type === "recoup") out.push(`${first}, ${name(t.payee)} is paid back ${usd(t.amount_cents)} before anyone else gets a share.`);
    else {
      out.push(`${first}, every sale is split ${t.shares.map((s) => `${name(s.payee)} ${pct(s.bps)}`).join(", ")}.`);
      t.caps.forEach((c) => out.push(`${name(c.payee)} receives at most ${usd(c.cap_cents)} from this split; after that, ${name(c.payee)}'s share goes ${c.overflow === "owner" ? `to ${name(owner_id)}` : "to the others by their percentages"}.`));
    }
  });
  return out;
}

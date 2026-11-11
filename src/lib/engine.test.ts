import { describe, expect, it } from "vitest";
import { allocate, emptyState, estimateFee, rulesProblems, simulate, engineSummary } from "./engine";
import type { Rules } from "./types";

const members = [
  { id: "mina", name: "Mina" },
  { id: "jun", name: "Jun" },
  { id: "sol", name: "Sol" },
];
const deal: Rules = {
  basis: "net_after_paypal_fee",
  tiers: [
    { type: "recoup", payee: "jun", amount_cents: 12000 },
    {
      type: "split",
      shares: [
        { payee: "mina", bps: 5000 },
        { payee: "jun", bps: 3000 },
        { payee: "sol", bps: 2000 },
      ],
      caps: [{ payee: "sol", cap_cents: 30000, overflow: "pro_rata" }],
    },
  ],
};
const total = (r: ReturnType<typeof allocate>) => Object.values(r.per_member).reduce((a, m) => a + m.amount_cents, 0);

describe("allocate", () => {
  it("pays the recoup first", () => {
    const r = allocate({ gross_cents: 1200, fee_cents: 91, rules: deal, members, owner_id: "mina", state: emptyState() });
    expect(r.ok).toBe(true);
    expect(r.per_member.jun.amount_cents).toBe(1109);
    expect(r.per_member.mina.amount_cents).toBe(0);
    expect(r.state.recouped["0"]).toBe(1109);
  });

  it("finishes the recoup inside a sale and splits the rest", () => {
    const r = allocate({ gross_cents: 1200, fee_cents: 91, rules: deal, members, owner_id: "mina", state: { recouped: { "0": 12000 - 840 }, capped: {} } });
    expect(r.ok).toBe(true);
    // 1109 - 840 = 269 to split: 134.5 / 80.7 / 53.8
    expect(r.per_member.jun.amount_cents).toBe(840 + 81);
    expect(r.per_member.mina.amount_cents + r.per_member.sol.amount_cents).toBe(269 - 81);
    expect(total(r)).toBe(1109);
    expect(r.events).toContain("recoup:0:done");
  });

  it("always adds up to what reached the account", () => {
    let state = emptyState();
    for (let i = 0; i < 300; i++) {
      const gross = 500 + ((i * 137) % 4000);
      const fee = estimateFee(gross);
      const r = allocate({ gross_cents: gross, fee_cents: fee, rules: deal, members, owner_id: "mina", state });
      expect(r.ok).toBe(true);
      expect(total(r)).toBe(gross - fee);
      state = r.state;
    }
  });

  it("stops Sol at the cap and gives the rest to the others by percentage", () => {
    const r = allocate({ gross_cents: 10000, fee_cents: 0, rules: deal, members, owner_id: "mina", state: { recouped: { "0": 12000 }, capped: { "1:sol": 29900 } } });
    expect(r.per_member.sol.amount_cents).toBe(100);
    // 9900 left between mina 50 and jun 30 -> 6187.5 / 3712.5
    expect(r.per_member.mina.amount_cents + r.per_member.jun.amount_cents).toBe(9900);
    expect(Math.abs(r.per_member.mina.amount_cents - 6188)).toBeLessThanOrEqual(1);
    expect(r.state.capped["1:sol"]).toBe(30000);
    expect(r.events).toContain("cap:1:sol");
  });

  it("sends overflow to the owner when the deal says so", () => {
    const rules: Rules = { ...deal, tiers: [deal.tiers[0], { ...(deal.tiers[1] as any), caps: [{ payee: "sol", cap_cents: 30000, overflow: "owner" }] }] };
    const r = allocate({ gross_cents: 10000, fee_cents: 0, rules, members, owner_id: "mina", state: { recouped: { "0": 12000 }, capped: { "1:sol": 30000 } } });
    expect(r.per_member.sol.amount_cents).toBe(0);
    expect(r.per_member.jun.amount_cents).toBe(3000);
    expect(r.per_member.mina.amount_cents).toBe(7000);
  });

  it("charges the fee to the owner on a gross basis", () => {
    const rules: Rules = { ...deal, basis: "gross", tiers: [deal.tiers[1]] };
    const r = allocate({ gross_cents: 1000, fee_cents: 84, rules, members, owner_id: "mina", state: emptyState() });
    expect(r.per_member.jun.amount_cents).toBe(300);
    expect(r.per_member.sol.amount_cents).toBe(200);
    expect(r.per_member.mina.amount_cents).toBe(500 - 84);
    expect(total(r)).toBe(916);
  });

  it("refuses when the owner's part would go negative", () => {
    const rules: Rules = { basis: "gross", tiers: [{ type: "split", shares: [{ payee: "mina", bps: 100 }, { payee: "jun", bps: 9900 }], caps: [] }] };
    const r = allocate({ gross_cents: 1000, fee_cents: 84, rules, members, owner_id: "mina", state: emptyState() });
    expect(r.ok).toBe(false);
  });

  it("refuses rules with an undecided basis", () => {
    const r = allocate({ gross_cents: 1200, fee_cents: 91, rules: { ...deal, basis: null }, members, owner_id: "mina", state: emptyState() });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/basis/);
  });

  it("refuses shares that do not add to 100%", () => {
    const rules: Rules = { basis: "net_after_paypal_fee", tiers: [{ type: "split", shares: [{ payee: "mina", bps: 5000 }, { payee: "jun", bps: 3000 }], caps: [] }] };
    expect(rulesProblems(rules, members).join()).toMatch(/80%/);
  });

  it("refuses an undecided overflow", () => {
    const rules: Rules = { ...deal, tiers: [deal.tiers[0], { ...(deal.tiers[1] as any), caps: [{ payee: "sol", cap_cents: 30000, overflow: null }] }] };
    expect(rulesProblems(rules, members).join()).toMatch(/above the cap/);
  });

  it("keeps money no rule covers with the owner", () => {
    const rules: Rules = { basis: "net_after_paypal_fee", tiers: [{ type: "recoup", payee: "jun", amount_cents: 500 }] };
    const r = allocate({ gross_cents: 1200, fee_cents: 0, rules, members, owner_id: "mina", state: emptyState() });
    expect(r.per_member.jun.amount_cents).toBe(500);
    expect(r.per_member.mina.amount_cents).toBe(700);
  });

  it("rounds a three-way split of odd cents without losing a cent", () => {
    const rules: Rules = { basis: "net_after_paypal_fee", tiers: [{ type: "split", shares: [{ payee: "mina", bps: 3334 }, { payee: "jun", bps: 3333 }, { payee: "sol", bps: 3333 }], caps: [] }] };
    const r = allocate({ gross_cents: 1001, fee_cents: 0, rules, members, owner_id: "mina", state: emptyState() });
    expect(total(r)).toBe(1001);
    expect(Math.max(...Object.values(r.per_member).map((m) => m.amount_cents)) - Math.min(...Object.values(r.per_member).map((m) => m.amount_cents))).toBeLessThanOrEqual(1);
  });

  it("never pays Sol past the cap over many sales", () => {
    const sim = simulate({ rules: deal, members, owner_id: "mina", price_cents: 1200, count: 400 });
    expect(sim.error).toBeUndefined();
    const last = sim.rows[sim.rows.length - 1];
    expect(last.cumulative.sol).toBe(30000);
    expect(sim.rows.some((r) => r.events.includes("cap:1:sol"))).toBe(true);
    expect(sim.rows.some((r) => r.events.includes("recoup:0:done"))).toBe(true);
  });

  it("writes a summary from the rules", () => {
    const s = engineSummary(deal, members, "mina");
    expect(s.join(" ")).toMatch(/Jun is paid back \$120.00/);
    expect(s.join(" ")).toMatch(/at most \$300.00/);
  });
});

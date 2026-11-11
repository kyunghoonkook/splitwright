// After PayPal captures a sale: split it, run the checks, send one Payouts batch.
import { allocate, usd } from "./engine";
import { createPayout, getPayoutBatch, itemStatus, toCents } from "./paypal";
import { addPaidToday, getPaidToday, getProject, getRuleSet, getSale, getState, mapItem, saveSale, saveState, today, withLock } from "./store";
import type { Line, Project, Sale } from "./types";

const MAX_ITEM = () => Number(process.env.MAX_PAYOUT_ITEM_CENTS || 5000);
const MAX_DAY = () => Number(process.env.MAX_DAILY_PAYOUT_CENTS || 30000);

export function readCapture(capture: any) {
  const b = capture?.seller_receivable_breakdown;
  return {
    capture_id: capture.id as string,
    status: capture.status as string,
    gross_cents: toCents(b?.gross_amount?.value ?? capture?.amount?.value ?? 0),
    fee_cents: toCents(b?.paypal_fee?.value ?? 0),
    net_cents: toCents(b?.net_amount?.value ?? capture?.amount?.value ?? 0),
    currency: (b?.gross_amount?.currency_code ?? capture?.amount?.currency_code) as string,
  };
}

export async function recordAndSettle(projectId: string, orderId: string, capture: any): Promise<Sale> {
  const c = readCapture(capture);
  return withLock(projectId, async () => {
    const existing = await getSale(c.capture_id);
    if (existing) return existing; // same capture already handled (webhook + client both report it)
    const sale: Sale = {
      capture_id: c.capture_id,
      order_id: orderId,
      project_id: projectId,
      gross_cents: c.gross_cents,
      fee_cents: c.fee_cents,
      net_cents: c.net_cents,
      split_base_cents: 0,
      rules_version: null,
      status: "held",
      hold_reason: null,
      captured_at: new Date().toISOString(),
      lines: [],
      steps: [],
    };
    await saveSale(sale, true);
    return settleLocked(projectId, sale);
  });
}

export async function retrySale(projectId: string, captureId: string) {
  return withLock(projectId, async () => {
    const sale = await getSale(captureId);
    if (!sale || sale.project_id !== projectId) throw new Error("Sale not found");
    if (sale.status !== "held") return sale;
    return settleLocked(projectId, sale);
  });
}

async function hold(sale: Sale, reason: string) {
  sale.status = "held";
  sale.hold_reason = reason;
  sale.lines = sale.lines.map((l) => ({ ...l, status: l.status === "retained" ? "retained" : "held" }));
  await saveSale(sale);
  return sale;
}

async function settleLocked(projectId: string, sale: Sale): Promise<Sale> {
  const p = (await getProject(projectId)) as Project;
  sale.steps = [];
  sale.lines = [];
  if (sale.gross_cents <= 0) return hold(sale, "PayPal did not report a completed amount for this capture.");
  if (!p.active_version) return hold(sale, "No signed rules are active yet. Nothing was sent.");
  const rs = await getRuleSet(projectId, p.active_version);
  if (!rs || rs.status !== "active") return hold(sale, "The active rules could not be loaded. Nothing was sent.");
  sale.rules_version = rs.version;

  const state = await getState(`${projectId}:${rs.version}`);
  const r = allocate({ gross_cents: sale.gross_cents, fee_cents: sale.fee_cents, rules: rs.rules, members: rs.members, owner_id: rs.owner_id, state });
  sale.steps = r.steps;
  if (!r.ok) return hold(sale, r.error || "Split failed");
  sale.split_base_cents = r.split_base_cents;
  const name = (id: string) => rs.members.find((m) => m.id === id)?.name ?? id;

  sale.lines = rs.members
    .filter((m) => r.per_member[m.id].amount_cents !== 0 || m.id === rs.owner_id)
    .map<Line>((m) => ({
      id: `${sale.capture_id}:${m.id}`,
      capture_id: sale.capture_id,
      member_id: m.id,
      amount_cents: r.per_member[m.id].amount_cents,
      parts: r.per_member[m.id].parts,
      trace: memberTrace(r.per_member[m.id].parts, rs.rules, name(m.id)),
      status: m.id === rs.owner_id ? "retained" : "pending",
    }));

  // ---- checks before any money moves ----
  const toSend = sale.lines.filter((l) => l.member_id !== rs.owner_id && l.amount_cents > 0);
  const sendTotal = toSend.reduce((a, l) => a + l.amount_cents, 0);
  const allTotal = sale.lines.reduce((a, l) => a + l.amount_cents, 0);
  if (allTotal !== sale.net_cents) return hold(sale, `Shares add up to ${usd(allTotal)} but ${usd(sale.net_cents)} arrived.`);
  if (sendTotal > sale.net_cents) return hold(sale, `Payouts of ${usd(sendTotal)} would exceed the ${usd(sale.net_cents)} this sale brought in.`);
  const tooBig = toSend.find((l) => l.amount_cents > MAX_ITEM());
  if (tooBig) return hold(sale, `${name(tooBig.member_id)}'s ${usd(tooBig.amount_cents)} is above the per-payout limit of ${usd(MAX_ITEM())}.`);
  const day = today();
  const paid = await getPaidToday(projectId, day);
  const dayLimit = Math.min(MAX_DAY(), p.daily_limit_cents ?? MAX_DAY());
  if (paid + sendTotal > dayLimit) return hold(sale, `Daily payout limit reached: ${usd(paid)} already sent today, this sale needs ${usd(sendTotal)}, limit ${usd(dayLimit)}.`);
  for (const l of toSend) {
    const now = p.members.find((m) => m.id === l.member_id);
    const signed = rs.members.find((m) => m.id === l.member_id);
    if (!now || !signed || now.paypal_email !== signed.paypal_email) return hold(sale, `${name(l.member_id)}'s PayPal email no longer matches the signed rules.`);
  }

  // engine state advances only when the sale is accepted
  await saveState(`${projectId}:${rs.version}`, r.state);
  sale.status = "allocated";
  sale.hold_reason = null;

  if (toSend.length) {
    const batchId = `sw_${sale.capture_id}`;
    try {
      const res = await createPayout({
        batch_id: batchId,
        items: toSend.map((l) => ({ receiver: rs.members.find((m) => m.id === l.member_id)!.paypal_email, cents: l.amount_cents, note: `Splitwright: your share of ${p.product.title} sale ${sale.capture_id.slice(-6)}, rules v${rs.version.slice(0, 6)}`, sender_item_id: l.id.slice(0, 63) })),
      });
      sale.payout_batch_id = res.batch_header.payout_batch_id;
      sale.batch_status = res.batch_header.batch_status;
      await addPaidToday(projectId, day, sendTotal);
    } catch (e: any) {
      // money did not move; undo the state advance
      await saveState(`${projectId}:${rs.version}`, state);
      return hold(sale, `PayPal refused the payout: ${e?.body?.name || e.message}`);
    }
  }
  sale.status = toSend.length ? "allocated" : "paid";
  await saveSale(sale);
  if (sale.payout_batch_id) await refreshBatch(sale).catch(() => {});
  return sale;
}

function memberTrace(parts: { tier_index: number; tier_type: string; amount_cents: number }[], _rules: unknown, name: string) {
  return parts
    .map((pt) => {
      if (pt.tier_type === "recoup") return `${usd(pt.amount_cents)} payback`;
      if (pt.tier_type === "split") return `${usd(pt.amount_cents)} share`;
      if (pt.tier_type === "overflow") return `${usd(pt.amount_cents)} above others' caps`;
      if (pt.tier_type === "fee") return `${usd(pt.amount_cents)} PayPal fee`;
      return `${usd(pt.amount_cents)} not covered by a rule`;
    })
    .join(" + ") || `${name}: nothing this sale`;
}

// Ask PayPal for the batch and copy item statuses onto the lines.
export async function refreshBatch(sale: Sale) {
  if (!sale.payout_batch_id) return sale;
  const b = await getPayoutBatch(sale.payout_batch_id);
  sale.batch_status = b.batch_header?.batch_status;
  for (const it of b.items ?? []) {
    const line = sale.lines.find((l) => l.id.slice(0, 63) === it.payout_item?.sender_item_id);
    if (!line) continue;
    line.payout_item_id = it.payout_item_id;
    line.payout_batch_id = sale.payout_batch_id;
    line.status = itemStatus(it.transaction_status);
    line.transaction_id = it.transaction_id;
    if (it.payout_item_fee?.value) line.payout_fee_cents = toCents(it.payout_item_fee.value);
    await mapItem(it.payout_item_id, sale.capture_id);
  }
  if (sale.lines.filter((l) => l.status !== "retained").every((l) => l.status === "succeeded")) sale.status = "paid";
  await saveSale(sale);
  return sale;
}

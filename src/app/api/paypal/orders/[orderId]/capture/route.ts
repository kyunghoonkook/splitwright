import { bad, handle, json } from "@/lib/http";
import { orderProject } from "@/lib/store";
import { captureOrder } from "@/lib/paypal";
import { recordAndSettle } from "@/lib/settle";

export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  return handle(async () => {
    const { orderId } = await ctx.params;
    const projectId = await orderProject(orderId);
    if (!projectId) return bad("Unknown order", 404);
    const o = await captureOrder(orderId);
    const pu = o.purchase_units?.[0];
    const cap = pu?.payments?.captures?.[0];
    if (!cap) return bad("PayPal returned no capture", 502);
    if (pu.custom_id && pu.custom_id !== projectId) return bad("Order does not belong to this project", 400);
    if (cap.status !== "COMPLETED") return json({ order_status: o.status, capture_status: cap.status, note: "Capture is not completed yet; the split runs when PayPal reports it." });
    const sale = await recordAndSettle(projectId, orderId, cap);
    return json({ order_id: orderId, capture_id: cap.id, sale: { status: sale.status, hold_reason: sale.hold_reason, gross_cents: sale.gross_cents, fee_cents: sale.fee_cents, net_cents: sale.net_cents, shares: sale.lines.map((l) => ({ member_id: l.member_id, share_bps: sale.net_cents ? Math.round((l.amount_cents / sale.net_cents) * 10000) : 0 })) } });
  });
}

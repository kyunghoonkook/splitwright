import { handle, json } from "@/lib/http";
import { getCapture, verifyWebhook } from "@/lib/paypal";
import { getSale, itemCapture, markWebhookSeen } from "@/lib/store";
import { recordAndSettle, refreshBatch } from "@/lib/settle";

export async function POST(req: Request) {
  return handle(async () => {
    const event = await req.json().catch(() => null);
    if (!event?.id) return json({ ok: false }, 400);
    const ok = await verifyWebhook(req.headers, event).catch(() => false);
    if (!ok) return json({ ok: false, reason: "signature not verified" }, 400);
    if (!(await markWebhookSeen(event.id))) return json({ ok: true, duplicate: true });
    const type: string = event.event_type || "";
    const r = event.resource || {};
    if (type === "PAYMENT.CAPTURE.COMPLETED") {
      const projectId = r.custom_id;
      const orderId = r.supplementary_data?.related_ids?.order_id;
      if (projectId && orderId && !(await getSale(r.id))) {
        const cap = await getCapture(r.id); // read the fee breakdown from PayPal, not from the event body
        await recordAndSettle(projectId, orderId, cap);
      }
    } else if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
      const captureId = (await itemCapture(r.payout_item_id)) || String(r.payout_item?.sender_item_id || "").split(":")[0];
      const sale = captureId ? await getSale(captureId) : null;
      if (sale) await refreshBatch(sale);
    } else if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
      const sid = String(r.batch_header?.sender_batch_header?.sender_batch_id || "");
      const sale = sid.startsWith("sw_") ? await getSale(sid.slice(3)) : null;
      if (sale) await refreshBatch(sale);
    }
    return json({ ok: true });
  });
}

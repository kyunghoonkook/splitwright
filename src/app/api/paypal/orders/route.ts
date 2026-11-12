import { z } from "zod";
import { bad, handle, json } from "@/lib/http";
import { getProject, mapOrder } from "@/lib/store";
import { createOrder } from "@/lib/paypal";

export async function POST(req: Request) {
  return handle(async () => {
    const b = z.object({ project_id: z.string(), redirect: z.boolean().optional() }).safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("Missing project");
    const p = await getProject(b.data.project_id);
    if (!p) return bad("Unknown project", 404);
    const origin = new URL(req.url).origin;
    const back = `${origin}/buy/${p.id}`;
    const o = await createOrder({ project_id: p.id, title: p.product.title, price_cents: p.product.price_cents, ...(b.data.redirect ? { return_url: back, cancel_url: back } : {}) });
    await mapOrder(o.id, p.id);
    const approve = (o.links ?? []).find((l: any) => l.rel === "payer-action" || l.rel === "approve")?.href;
    return json({ id: o.id, approve });
  });
}

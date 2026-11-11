import { z } from "zod";
import { bad, handle, json } from "@/lib/http";
import { getProject, mapOrder } from "@/lib/store";
import { createOrder } from "@/lib/paypal";

export async function POST(req: Request) {
  return handle(async () => {
    const b = z.object({ project_id: z.string() }).safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("Missing project");
    const p = await getProject(b.data.project_id);
    if (!p) return bad("Unknown project", 404);
    const o = await createOrder({ project_id: p.id, title: p.product.title, price_cents: p.product.price_cents });
    await mapOrder(o.id, p.id);
    return json({ id: o.id });
  });
}

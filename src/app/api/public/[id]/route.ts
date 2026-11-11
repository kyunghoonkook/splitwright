import { bad, handle, json } from "@/lib/http";
import { getProject } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const p = await getProject(id);
    if (!p) return bad("Unknown product", 404);
    return json({ id: p.id, name: p.name, product: p.product, members: p.members.map((m) => ({ id: m.id, name: m.name, color: m.color })), rules_active: !!p.active_version, paypal_client_id: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID });
  });
}

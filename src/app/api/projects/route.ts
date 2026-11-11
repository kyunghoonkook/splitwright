import { z } from "zod";
import { bad, handle, json } from "@/lib/http";
import { createProject, demoInput } from "@/lib/projects";

const Body = z.object({
  demo: z.boolean().optional(),
  name: z.string().min(1).max(60).optional(),
  product_title: z.string().min(1).max(120).optional(),
  price_cents: z.number().int().min(100).max(5000).optional(),
  members: z.array(z.object({ name: z.string().min(1).max(40), paypal_email: z.string().email() })).min(2).max(5).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const b = Body.safeParse(await req.json().catch(() => ({})));
    if (!b.success) return bad("Check the team names and PayPal emails.");
    let input;
    if (b.data.demo || !b.data.members) input = demoInput();
    else
      input = {
        name: b.data.name || "Untitled project",
        product: { title: b.data.product_title || b.data.name || "Digital product", price_cents: b.data.price_cents || 1000, blurb: "" },
        members: b.data.members,
        source: "",
      };
    const p = await createProject(input);
    return json({ id: p.id, lead_link: `/p/${p.id}?k=${p.lead_token}` });
  });
}

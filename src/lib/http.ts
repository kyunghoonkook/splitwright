import { NextResponse } from "next/server";
import { PayPalError } from "./paypal";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const bad = (message: string, status = 400) => json({ error: message }, status);
export const keyOf = (req: Request) => new URL(req.url).searchParams.get("k") || req.headers.get("x-sw-key");

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    if (e instanceof PayPalError) return bad(`PayPal: ${e.body?.details?.[0]?.issue || e.body?.name || e.message}`, 502);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(e);
    return bad(msg, 500);
  });
}

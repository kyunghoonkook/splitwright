// PayPal REST, sandbox. Server only.
const BASE = () => process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let cached: { token: string; exp: number } | null = null;
async function token() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`PayPal auth failed: ${j.error_description || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.message || body?.name || `PayPal error ${status}`);
  }
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${BASE()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) throw new PayPalError(r.status, j);
  return j;
}

const money = (c: number) => (c / 100).toFixed(2);
export const toCents = (v: string | number) => Math.round(Number(v) * 100);

export function createOrder(p: { project_id: string; title: string; price_cents: number; return_url?: string; cancel_url?: string }) {
  return call("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: p.project_id,
        description: p.title.slice(0, 120),
        amount: { currency_code: "USD", value: money(p.price_cents), breakdown: { item_total: { currency_code: "USD", value: money(p.price_cents) } } },
        items: [{ name: p.title.slice(0, 120), quantity: "1", unit_amount: { currency_code: "USD", value: money(p.price_cents) }, category: "DIGITAL_GOODS" }],
      },
    ],
    payment_source: { paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", brand_name: "Splitwright demo", ...(p.return_url ? { return_url: p.return_url, cancel_url: p.cancel_url } : {}) } } },
  });
}

export function captureOrder(orderId: string) {
  return call("POST", `/v2/checkout/orders/${orderId}/capture`, {}, { "PayPal-Request-Id": `cap-${orderId}` });
}

export function getOrder(orderId: string) {
  return call("GET", `/v2/checkout/orders/${orderId}`);
}

export function getCapture(captureId: string) {
  return call("GET", `/v2/payments/captures/${captureId}`);
}

export function createPayout(p: { batch_id: string; items: { receiver: string; cents: number; note: string; sender_item_id: string }[] }) {
  return call(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: { sender_batch_id: p.batch_id, email_subject: "Your share from a sale", email_message: "Splitwright sent your share of a sale, as agreed in your team's signed rules." },
      items: p.items.map((i) => ({ recipient_type: "EMAIL", receiver: i.receiver, amount: { value: money(i.cents), currency: "USD" }, note: i.note, sender_item_id: i.sender_item_id })),
    },
    { "PayPal-Request-Id": p.batch_id },
  );
}

export function getPayoutBatch(batchId: string) {
  return call("GET", `/v1/payments/payouts/${batchId}?fields=batch_header,items&total_required=true&page_size=50`);
}

export async function verifyWebhook(headers: Headers, event: unknown) {
  const id = process.env.PAYPAL_WEBHOOK_ID;
  if (!id) return false;
  const j = await call("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: id,
    webhook_event: event,
  });
  return j.verification_status === "SUCCESS";
}

// Map PayPal payout item status to ours.
export function itemStatus(s: string): "pending" | "succeeded" | "unclaimed" | "failed" | "held" | "returned" | "blocked" {
  switch ((s || "").toUpperCase()) {
    case "SUCCESS":
      return "succeeded";
    case "UNCLAIMED":
      return "unclaimed";
    case "FAILED":
    case "DENIED":
    case "REFUNDED":
    case "REVERSED":
      return "failed";
    case "RETURNED":
      return "returned";
    case "ONHOLD":
      return "held";
    case "BLOCKED":
      return "blocked";
    default:
      return "pending";
  }
}

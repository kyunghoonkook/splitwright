import { json } from "@/lib/http";
export async function GET() {
  return json({ paypal_client_id: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID, sandbox: true });
}

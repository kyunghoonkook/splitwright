# Splitwright

Type your team's revenue deal in plain words. Everyone signs the exact rules. Each PayPal sale pays every share.

**Live demo (PayPal sandbox, no real money):** https://splitwright.vercel.app
Built for the PayPal AI Hackathon. License: MIT.

## What it does

Splitwright is for two to five people who make one digital product together and sell it through one person's PayPal account.

1. **Paste the deal.** The account owner pastes the message where the team agreed how to split the money. Gemini turns it into ordered rules (pay someone back first, then percentage shares, optional caps) and shows which sentence each rule came from.
2. **Answer what the deal does not say.** Gemini lists the decisions the message never made, as questions with fixed choices (for example: is the split taken before or after PayPal's fee, and where does a capped person's share go after the cap). The owner picks an answer. Nothing is filled in by the model on its own. Rules can also be entered by hand.
3. **Preview.** A plain TypeScript engine runs 160 sample sales and highlights the sale where a payback finishes and the sale where a cap is reached.
4. **Sign.** Each member opens a private link and signs that exact version of the rules. Any edit creates a new version that needs new signatures.
5. **Sell.** A buyer pays on the product page with PayPal (Orders v2). The server captures the order and reads PayPal's fee from the capture.
6. **Split and pay.** The engine splits what reached the account in integer cents, runs safety checks, and sends one PayPal Payouts batch. The account owner's own share stays in the account ("Kept in account").
7. **Track.** PayPal webhooks (signature verified on the server) update each payout line: Paid, Unclaimed, Failed, and so on. The ledger also refreshes from the Payouts API.
8. **Statements.** The owner gets a ledger with the math behind every line. Each member gets a "my share" page.

If any check fails, nothing is sent: the sale is **held** with the reason, and the owner can press "Check again and pay" later.

## PayPal APIs used (sandbox)

| API | Call | Used for |
|---|---|---|
| OAuth 2.0 | `POST /v1/oauth2/token` | server access token |
| Orders v2 | `POST /v2/checkout/orders` | create the buyer's order (JS SDK buttons, or a same-tab redirect with no pop-up) |
| Orders v2 | `POST /v2/checkout/orders/{id}/capture` | capture; `seller_receivable_breakdown` gives the PayPal fee and net amount |
| Payments v2 | `GET /v2/payments/captures/{id}` | re-read a capture reported by a webhook |
| Payouts v1 | `POST /v1/payments/payouts` | one batch per sale, one item per member (idempotent via `PayPal-Request-Id`) |
| Payouts v1 | `GET /v1/payments/payouts/{batch_id}` | refresh item status |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | verify each incoming event |
| Webhook events | `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.PAYOUTS-ITEM.*` | settle late captures, update payout lines |
| JS SDK | Smart Payment Buttons | checkout on the product page |

## What the AI does, and what it does not do

Gemini (structured JSON output) does three things:
- converts the pasted deal into rules and cites the source sentence for each rule,
- lists the open questions the deal leaves unanswered, with fixed choices,
- rewrites the final rules as a short plain-language summary for signers (if it is slow or fails, a summary written by code is used).

Gemini never produces an amount and never moves money. Its output is validated against a schema; anything that does not validate is left as "not decided" for the owner. All amounts come from `src/lib/engine.ts`, which has unit tests (`npx vitest run`, 14 tests).

## Safety checks before any payout

- shares must add up exactly to the net amount that reached the account,
- payouts can never exceed what the sale brought in,
- per-item limit (demo: $50.00) and a daily limit the owner can lower,
- every recipient's PayPal email must match the signed version of the rules,
- no active signed rules means nothing is sent.

## Try it as a judge (sandbox, fake money)

1. Open https://splitwright.vercel.app and press **Open a demo team**. This creates a fresh team (Mina owns the PayPal account, Jun and Sol are members) with private links.
2. Press **Turn into rules**, answer the two questions, then open **Preview 160 sales**.
3. Press **Send for signatures**, open each private link and press **I agree**. The status becomes **Active**.
4. Open **Product page** and pay $12.00. Use **Pay with PayPal in this tab (no pop-up)** if pop-ups are blocked.
   Sandbox buyer account (fake money only):
   - email: `buyer.splitwright.demo@example.com`
   - password: `SplitDemo#2026`
5. Open **Ledger**. Lines start as "Sending" and change when PayPal reports back (usually within a minute). Click a line to see the math.

About the demo team's PayPal accounts:
- Mina is a sandbox business account (the app's receiving account). Her share is kept in the account.
- Jun is a sandbox personal account. His payouts show as **Paid**, and the deposit is visible in that sandbox account.
- Sol's email (`sol.splitwright.demo@example.com`) has no PayPal account on purpose, so her payouts show as **Unclaimed**. That is what PayPal does when the receiver has no account yet.

The buyer account above was created through PayPal's own sandbox checkout ("pay with card and create an account") using a PayPal test card number.

## Verified run (sandbox, 13 Nov 2026 KST)

| | |
|---|---|
| Rules version | 909317059c02, signed by all three |
| Order / capture | 9JG66454W8585725Y / 2RR85329M40875409 |
| Sale | $12.00, PayPal fee $0.77, net $11.23 |
| Split | Mina $1.61 (kept), Jun $8.97 ($8.00 payback + $0.97), Sol $0.65 |
| Payouts batch | JEHETFYTYYNJG: Jun Paid, Sol Unclaimed |
| Held test | daily limit lowered to $16.00, third sale held with the reason shown, released after the limit was raised |

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
npx vitest run               # engine tests
```

Environment variables (see `.env.example`): PayPal sandbox app client ID and secret (app needs Payouts enabled), `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`, `PAYPAL_WEBHOOK_ID`, a Gemini API key, Upstash Redis REST URL and token (`KV_REST_API_URL`, `KV_REST_API_TOKEN`), payout limits, and the three demo member emails.

Stack: Next.js and TypeScript on Vercel, Upstash Redis for storage, AG Grid Community for the preview table and the ledger (sorting, filters, quick search, pinned column, CSV export), zod for validation.

## Not built

- Refunds and chargebacks (a refund is not carried against future shares yet).
- Teams connecting their own PayPal account; the demo uses one sandbox app account as the seller.
- PayPal multiparty / partner payments, scheduled or batched payouts, currencies other than USD.
- PayPal Agent Toolkit is not used.
- Email delivery of signing links; the demo shows all links on the owner's screen so one person can run it.

## How it was made

Kook Kyunghoon builds games and web apps on his own. The plan was written with Claude Fable 5.2, and the code was written by a Claude Opus 5.5 coding agent following his instructions. The full flow was tested end to end in the PayPal sandbox.

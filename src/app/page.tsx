"use client";
import { useState } from "react";
import { api } from "@/components/ui";

export default function Home() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [own, setOwn] = useState(false);
  const [form, setForm] = useState({ name: "", price: "10.00", members: [{ name: "", paypal_email: "" }, { name: "", paypal_email: "" }] });

  async function start(body: any) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api("/api/projects", { method: "POST", body: JSON.stringify(body) });
      window.location.href = r.lead_link.replace(/^\/p\/([^?]+)/, "/p/$1/deal");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="plain">
      <div className="plainhead">
        <i /> Splitwright
      </div>
      <div className="grid2">
        <div className="panel stack">
          <h1>Your team&apos;s money deal, written down exactly, paid out on every sale.</h1>
          <p>
            Two to five people make a digital product together and sell it through one person&apos;s PayPal account. Paste the deal the way you wrote it in your group chat. Splitwright turns it into rules,
            asks about what the chat never settled, has everyone sign the exact version, and sends each share through PayPal Payouts when a sale is captured.
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => start({ demo: true })}>
              {busy ? "Creating…" : "Open a demo team"}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setOwn((v) => !v)}>
              Set up your own
            </button>
          </div>
          <p className="small dim">The demo team is Mina (owns the PayPal account), Jun and Sol, selling a $12 asset pack. Each click creates a fresh copy with its own private links.</p>
          {err && <p className="err">{err}</p>}
        </div>
        <div className="panel stack">
          <h3>How it works</h3>
          <table className="t">
            <tbody>
              <tr><td className="mono">1</td><td>Paste the deal. Gemini turns it into ordered rules and shows which sentence each rule came from.</td></tr>
              <tr><td className="mono">2</td><td>Answer the questions the deal leaves open. The model cannot fill these in.</td></tr>
              <tr><td className="mono">3</td><td>Preview 60 sales, then every member signs that exact version.</td></tr>
              <tr><td className="mono">4</td><td>A buyer pays with PayPal. The engine splits the captured amount in cents, checks limits, and sends one Payouts batch.</td></tr>
              <tr><td className="mono">5</td><td>Webhooks update the ledger. Everyone sees how their share was worked out.</td></tr>
            </tbody>
          </table>
          <p className="small dim">PayPal sandbox only. No real money moves.</p>
        </div>
      </div>
      {own && (
        <div className="panel stack">
          <h2>Set up your own team</h2>
          <p className="small dim">Use PayPal sandbox personal account emails for the other members, or the payouts will stay unclaimed. The first person is the account owner; money arrives in this app&apos;s sandbox business account.</p>
          <div className="row">
            <label className="f" style={{ flex: "2 1 220px" }}>
              Product
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name of what you sell" />
            </label>
            <label className="f" style={{ flex: "1 1 100px" }}>
              Price (USD)
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" />
            </label>
          </div>
          {form.members.map((m, i) => (
            <div className="row" key={i}>
              <label className="f" style={{ flex: "1 1 140px" }}>
                {i === 0 ? "Account owner" : `Member ${i + 1}`}
                <input value={m.name} onChange={(e) => setForm({ ...form, members: form.members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              </label>
              <label className="f" style={{ flex: "2 1 220px" }}>
                PayPal email
                <input value={m.paypal_email} onChange={(e) => setForm({ ...form, members: form.members.map((x, j) => (j === i ? { ...x, paypal_email: e.target.value } : x)) })} />
              </label>
            </div>
          ))}
          <div className="row">
            {form.members.length < 5 && (
              <button className="btn ghost sm" onClick={() => setForm({ ...form, members: [...form.members, { name: "", paypal_email: "" }] })}>
                Add member
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() => start({ name: form.name || "Untitled", product_title: form.name || "Digital product", price_cents: Math.round(Number(form.price) * 100), members: form.members })}
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

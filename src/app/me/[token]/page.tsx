"use client";
import Link from "next/link";
import {Fragment, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Status, usd, when } from "@/components/ui";

export default function MePage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api(`/api/me/${token}`).then(setD).catch((e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);
  if (err) return <div className="plain"><div className="panel"><h2>Can&apos;t open this link</h2><p className="dim">{err}</p></div></div>;
  if (!d) return <div className="plain"><p className="dim">Loading…</p></div>;
  const color = d.project.members.find((m: any) => m.id === d.me.id)?.color;
  return (
    <div className="plain">
      <Link className="plainhead" href="/"><i /> Splitwright</Link>
      <div className="panel row between">
        <div>
          <h1><span className="sq" style={{ background: color, width: 14, height: 14 }} />{d.me.name}&apos;s share · {d.project.name}</h1>
          <div className="dim small">Payouts go to <span className="mono">{d.me.paypal_email}</span>{d.me.is_owner ? " (account owner: your part stays in the account)" : ""}</div>
        </div>
        <div className="row small">
          {d.ruleset ? <><Status s={d.ruleset.status} /><span className="mono">v {d.ruleset.version.slice(0, 6)}</span></> : <span className="dim">No active rules</span>}
          {d.sign_link && <Link className="btn sm" href={d.sign_link}>Sign new version</Link>}
        </div>
      </div>
      <div className="grid4">
        <div className="panel stat"><div className="v">{usd(d.totals?.earned ?? 0)}</div><div className="l">Your part of all sales</div></div>
        <div className="panel stat"><div className="v">{usd(d.totals?.sent ?? 0)}</div><div className="l">{d.me.is_owner ? "—" : "Paid to your PayPal"}</div></div>
        <div className="panel stat"><div className="v">{usd(d.totals?.pending ?? 0)}</div><div className="l">On the way</div></div>
        <div className="panel stat"><div className="v">{usd(d.totals?.held ?? 0)}</div><div className="l">Held, not sent</div></div>
      </div>
      {d.progress.length > 0 && (
        <div className="panel stack">
          {d.progress.map((g: any) => (
            <div key={g.label} className="stack" style={{ gap: 4 }}>
              <div className="row between small"><span>{g.label}</span><span className="mono">{usd(g.done_cents)} of {usd(g.of_cents)}</span></div>
              <div className="bar"><span style={{ width: `${Math.min(100, (g.done_cents / g.of_cents) * 100)}%`, background: color }} /></div>
            </div>
          ))}
        </div>
      )}
      <div className="panel flush scroll-x">
        <table className="t">
          <thead>
            <tr><th>When</th><th className="num">Sale</th><th className="num">PayPal fee</th><th className="num">Your part</th><th>Status</th><th>PayPal payout item</th></tr>
          </thead>
          <tbody>
            {d.lines.length === 0 && <tr><td colSpan={6} className="dim">No sales yet.</td></tr>}
            {d.lines.map((l: any) => (
              <Fragment key={l.id}>
                <tr className="click" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td>{when(l.captured_at)}</td>
                  <td className="num">{usd(l.gross_cents)}</td>
                  <td className="num">{usd(l.fee_cents)}</td>
                  <td className="num"><b>{usd(l.amount_cents)}</b></td>
                  <td><Status s={l.status} /></td>
                  <td className="mono small">{l.payout_item_id ?? (l.status === "retained" ? "stays in account" : "")}</td>
                </tr>
                {open === l.id && (
                  <tr>
                    <td colSpan={6}>
                      <div className="trace">
                        {l.steps.map((s: string, i: number) => <div key={i}>{s}</div>)}
                        <div>Your part: {l.trace}{l.payout_fee_cents ? ` · PayPal payout fee ${usd(l.payout_fee_cents)}` : ""}</div>
                        {l.hold_reason && <div style={{ color: "var(--warn)" }}>Held: {l.hold_reason}</div>}
                        <div className="dim">capture {l.capture_id} · rules v{l.rules_version?.slice(0, 6)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small dim">Click a row to see how your part was calculated. Sandbox demo: no real money moves.</p>
    </div>
  );
}

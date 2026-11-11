"use client";
import Link from "next/link";
import {useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, BadLink, RulesStatus, Shell, Status, usd, useKey, useLeadProject, when, Who } from "@/components/ui";

export default function Overview() {
  const { id } = useParams<{ id: string }>();
  const k = useKey();
  const { data, error, reload } = useLeadProject(id, k);
  const [limit, setLimit] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const p = data?.project;

  useEffect(() => {
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if (data && !limit) setLimit((data.daily_limit_cents / 100).toFixed(2));
  }, [data, limit]);

  if (error) return <BadLink error={error} />;
  const totals = data?.totals;
  const earned = p ? p.members.map((m: any) => ({ m, v: Math.max(0, totals?.per_member?.[m.id]?.earned ?? 0) })) : [];
  const sum = earned.reduce((a: number, x: any) => a + x.v, 0);
  const held = (data?.recent ?? []).filter((s: any) => s.status === "held");
  const name = (mid: string) => p?.members.find((m: any) => m.id === mid);

  async function retry(c: string) {
    setMsg(null);
    try {
      await api(`/api/projects/${id}/sales/${c}/retry?k=${k}`, { method: "POST" });
      await reload();
    } catch (e: any) {
      setMsg(e.message);
    }
  }
  async function saveLimit() {
    setMsg(null);
    try {
      await api(`/api/projects/${id}/limits?k=${k}`, { method: "PUT", body: JSON.stringify({ daily_limit_cents: Math.round(Number(limit) * 100) }) });
      await reload();
      setMsg("Daily limit saved.");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <Shell id={id} k={k} here="" title={p?.name ?? "Loading…"} status={<RulesStatus project={p} />}>
      {p && (
        <>
          {!p.active_version && (
            <div className="note">
              {p.pending_version ? "Rules are waiting for signatures. " : "No signed rules yet. "}
              Sales captured before the rules are active are held and nothing is sent.{" "}
              <Link href={`/p/${id}/${p.pending_version ? "preview" : "deal"}?k=${k}`}>{p.pending_version ? "See signatures" : "Write the deal"} →</Link>
            </div>
          )}
          <div className="grid4">
            <div className="panel stat"><div className="v">{usd(totals.gross_cents)}</div><div className="l">{totals.sales} sales captured</div></div>
            <div className="panel stat"><div className="v">{usd(totals.fee_cents)}</div><div className="l">PayPal fees</div></div>
            <div className="panel stat"><div className="v">{usd(totals.sent_cents)}</div><div className="l">Paid out to members</div></div>
            <div className="panel stat"><div className="v">{totals.held_sales}</div><div className="l">Sales held</div></div>
          </div>
          <div className="panel stack">
            <h3>Where the money went</h3>
            <div className="flow">
              {earned.filter((x: any) => x.v > 0).map((x: any) => (
                <span key={x.m.id} style={{ width: `${(x.v / (sum || 1)) * 100}%`, background: x.m.color }} title={`${x.m.name} ${usd(x.v)}`} />
              ))}
            </div>
            <div className="row" style={{ gap: 18 }}>
              {earned.map((x: any) => (
                <span key={x.m.id} className="small">
                  <Who {...x.m} /> <span className="mono">{usd(x.v)}</span>{" "}
                  <span className="dim">({x.m.id === p.owner_id ? "kept" : `${usd(totals.per_member[x.m.id]?.sent ?? 0)} paid`})</span>
                </span>
              ))}
            </div>
          </div>
          {held.length > 0 && (
            <div className="panel stack">
              <h3>Held: nothing was sent for these sales</h3>
              {held.map((s: any) => (
                <div key={s.capture_id} className="row between" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                  <div>
                    <div><span className="mono">{usd(s.gross_cents)}</span> · {when(s.captured_at)} · <span className="mono small">{s.capture_id}</span></div>
                    <div className="small" style={{ color: "var(--warn)" }}>{s.hold_reason}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => retry(s.capture_id)}>Check again and pay</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid2">
            <div className="panel flush scroll-x">
              <div style={{ padding: "10px 14px" }} className="row between">
                <h3 style={{ margin: 0 }}>Recent sales</h3>
                <Link className="small" href={`/p/${id}/ledger?k=${k}`}>Full ledger →</Link>
              </div>
              <table className="t">
                <thead><tr><th>When</th><th className="num">Paid</th><th className="num">Fee</th><th>Split</th><th>Status</th></tr></thead>
                <tbody>
                  {data.recent.length === 0 && <tr><td colSpan={5} className="dim">No sales yet. Open the product page and buy with a sandbox account.</td></tr>}
                  {data.recent.map((s: any) => (
                    <tr key={s.capture_id}>
                      <td>{when(s.captured_at)}</td>
                      <td className="num">{usd(s.gross_cents)}</td>
                      <td className="num">{usd(s.fee_cents)}</td>
                      <td className="small">{s.lines.filter((l: any) => l.amount_cents).map((l: any) => `${name(l.member_id)?.name} ${usd(l.amount_cents)}`).join(" · ")}</td>
                      <td><Status s={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel stack">
              <h3>Links</h3>
              <table className="t">
                <tbody>
                  <tr><td>Product page (buyers)</td><td className="num"><a href={`/buy/${id}`} target="_blank" rel="noreferrer">open ↗</a></td></tr>
                  {p.members.map((m: any) => (
                    <tr key={m.id}><td><Who {...m} />&apos;s statement</td><td className="num"><a href={m.me_link} target="_blank" rel="noreferrer">open ↗</a></td></tr>
                  ))}
                </tbody>
              </table>
              <hr />
              <h3>Safety limits</h3>
              <div className="small dim">Each payout item can be at most {usd(data.max_item_cents)}. Sent today: {usd(data.paid_today_cents)}.</div>
              <div className="row">
                <label className="f">Daily payout limit (USD)<input style={{ width: 120 }} value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" /></label>
                <button className="btn ghost sm" style={{ alignSelf: "end" }} onClick={saveLimit}>Save</button>
              </div>
              {msg && <p className="small">{msg}</p>}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

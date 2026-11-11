"use client";
import Link from "next/link";
import {useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, pct, Status, usd, when, Who } from "@/components/ui";
import { Grid, moneyCol } from "@/components/Grid";

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/api/sign/${token}`).then(setD).catch((e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
  }, [load]);

  const p = d?.project;
  const rs = d?.ruleset;
  const rows = useMemo(() => {
    if (!d?.preview?.rows || !p) return [];
    return d.preview.rows.map((r: any) => {
      const o: any = { n: r.n, gross: r.gross_cents, fee: r.fee_cents, events: r.events.join(" ") };
      p.members.forEach((m: any) => {
        o[m.id] = r.per[m.id];
        o[`c_${m.id}`] = r.cumulative[m.id];
      });
      return o;
    });
  }, [d, p]);
  const cols = useMemo(() => (p ? [{ field: "n", headerName: "Sale", width: 76, cellClass: "num" }, moneyCol("gross", "Price", { width: 96 }), ...p.members.map((m: any) => moneyCol(m.id, m.name, { width: 100 })), ...p.members.map((m: any) => moneyCol(`c_${m.id}`, `${m.name} total`, { width: 124, flex: 1 }))] : []), [p]);

  if (err) return <div className="plain"><div className="panel"><h2>Can&apos;t open this link</h2><p className="dim">{err}</p></div></div>;
  if (!d) return <div className="plain"><p className="dim">Loading…</p></div>;
  const mine = rs?.signatures?.find((s: any) => s.member_id === d.me.id);
  const name = (id: string) => p.members.find((m: any) => m.id === id);

  async function sign() {
    setBusy(true);
    try {
      await api(`/api/sign/${token}`, { method: "POST", body: JSON.stringify({ version: rs.version }) });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="plain">
      <Link className="plainhead" href="/"><i /> Splitwright</Link>
      <div className="panel row between">
        <div>
          <h1>{p.name}</h1>
          <div className="dim small">Signing as <b>{d.me.name}</b> · payouts go to <span className="mono">{d.me.paypal_email}</span></div>
        </div>
        {rs && <span className="row"><Status s={rs.status} /> <span className="mono small">version {rs.version}</span></span>}
      </div>
      {!rs && <div className="panel"><p>Nothing to sign yet. The account owner has not sent the rules.</p></div>}
      {rs && (
        <>
          <div className="grid2">
            <div className="panel stack">
              <h3>What you are agreeing to</h3>
              {rs.summary.map((l: string, i: number) => <div key={i}>{l}</div>)}
              <hr />
              <h3>Exact rules</h3>
              <div className="small">
                <div>Basis: {rs.rules.basis === "gross" ? "full sale price; the account owner pays PayPal's fee" : "what is left after PayPal's fee"}</div>
                {rs.rules.tiers.map((t: any, i: number) => (
                  <div key={i}>
                    {i + 1}.{" "}
                    {t.type === "recoup" ? (
                      <>{name(t.payee)?.name} gets {usd(t.amount_cents)} back first</>
                    ) : (
                      <>
                        split {t.shares.map((s: any) => `${name(s.payee)?.name} ${pct(s.bps)}`).join(", ")}
                        {t.caps.map((c: any) => `; ${name(c.payee)?.name} capped at ${usd(c.cap_cents)}, then ${c.overflow === "owner" ? `to ${name(p.owner_id)?.name}` : "to the others by percentage"}`).join("")}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <hr />
              <h3>Original message</h3>
              <div className="source small dim">{rs.source_text}</div>
            </div>
            <div className="panel stack">
              <h3>Signatures</h3>
              <table className="t">
                <tbody>
                  {rs.members.map((m: any) => {
                    const s = rs.signatures.find((x: any) => x.member_id === m.id);
                    return (
                      <tr key={m.id}>
                        <td><Who name={m.name} color={name(m.id)?.color} /></td>
                        <td>{s ? <span className="st succeeded">Signed {when(s.signed_at)}</span> : <Status s="pending" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rs.status === "awaiting_signatures" && !mine && (
                <button className="btn" disabled={busy} onClick={sign}>
                  I agree to version <span className="mono">{rs.version}</span>
                </button>
              )}
              {mine && rs.status === "awaiting_signatures" && <p className="dim">You signed. The rules start when everyone has signed.</p>}
              {rs.status === "active" && <p>These rules are active. Every captured sale is split by them.</p>}
              <Link className="btn ghost" href={`/me/${token}`}>My share →</Link>
            </div>
          </div>
          <div className="panel flush">
            <div style={{ padding: "10px 14px" }}><h3 style={{ margin: 0 }}>The first 160 sales under these rules (estimated fees)</h3></div>
            <Grid rows={rows} cols={cols} height={380} getRowId={(r) => String(r.data.n)} rowClassRules={{ "sw-edge": (r) => !!r.data?.events }} />
          </div>
        </>
      )}
      <style>{`.sw-edge { background: #FFF3B8 !important; }`}</style>
    </div>
  );
}

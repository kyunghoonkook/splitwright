"use client";
import Link from "next/link";
import {useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, BadLink, RulesStatus, Shell, usd, useKey, useLeadProject, Who, Status, when } from "@/components/ui";
import { Grid, moneyCol } from "@/components/Grid";

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const k = useKey();
  const { data, error, reload } = useLeadProject(id, k);
  const [pv, setPv] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const p = data?.project;
  const pending = data?.pending;

  useEffect(() => {
    if (!k) return;
    api(`/api/projects/${id}/preview?k=${k}`).then(setPv).catch((e) => setMsg(e.message));
  }, [id, k, data?.project?.draft?.updated_at]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [pending, reload]);

  const rows = useMemo(() => {
    if (!pv?.rows || !p) return [];
    return pv.rows.map((r: any) => {
      const o: any = { n: r.n, gross: r.gross_cents, fee: r.fee_cents, events: r.events.join(" ") };
      p.members.forEach((m: any) => {
        o[m.id] = r.per[m.id];
        o[`c_${m.id}`] = r.cumulative[m.id];
      });
      o.note = r.events
        .map((e: string) => {
          const [kind, , who] = e.split(":");
          if (kind === "recoup") return "payback finished";
          if (kind === "cap") return `${p.members.find((m: any) => m.id === who)?.name} reaches cap`;
          return e;
        })
        .join(", ");
      return o;
    });
  }, [pv, p]);

  const cols = useMemo(() => {
    if (!p) return [];
    return [
      { field: "n", headerName: "Sale", width: 76, cellClass: "num", pinned: "left" as const },
      moneyCol("gross", "Price", { width: 96 }),
      moneyCol("fee", "Est. fee", { width: 100 }),
      ...p.members.map((m: any) => moneyCol(m.id, m.name, { width: 100, headerTooltip: `${m.name}'s part of this sale` })),
      ...p.members.map((m: any) => moneyCol(`c_${m.id}`, `${m.name} total`, { width: 124 })),
      { field: "note", headerName: "What changes", minWidth: 180, flex: 1 },
    ];
  }, [p]);

  if (error) return <BadLink error={error} />;
  const signed = (mid: string) => pending?.signatures?.find((s: any) => s.member_id === mid);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/projects/${id}/deal/request-signatures?k=${k}`, { method: "POST" });
      await reload();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <Shell id={id} k={k} here="/preview" title={p ? `${p.name}: preview & sign` : "Loading…"} status={<RulesStatus project={p} />}>
      {p && (
        <>
          {pv?.problems?.length > 0 && (
            <div className="panel">
              <p>These rules are not complete yet:</p>
              <ul>{pv.problems.map((x: string) => <li key={x}>{x}</li>)}</ul>
              <Link className="btn" href={`/p/${id}/deal?k=${k}`}>Back to the deal</Link>
            </div>
          )}
          {pv?.rows && (
            <div className="grid2">
              <div className="panel stack">
                <h3>The rules in plain words</h3>
                {(pending?.summary ?? pv.engine_summary).map((l: string, i: number) => (
                  <div key={i}>{l}</div>
                ))}
                <p className="small dim">
                  {pending?.summary_by === "gemini" ? "Summary rewritten by Gemini from the rules. " : "Summary written by code from the rules. "}
                  If this text and the table ever disagree, the table is right.
                </p>
              </div>
              <div className="panel stack">
                {!pending && !p.active_version && (
                  <>
                    <h3>Signatures</h3>
                    <p>When the table looks right, freeze this version and send each person a private link to sign it. Any later edit creates a new version and needs new signatures.</p>
                    <div className="row">
                      <button className="btn" disabled={busy} onClick={send}>Send for signatures</button>
                    </div>
                  </>
                )}
                {!pending && p.active_version && (
                  <>
                    <h3>Signatures</h3>
                    <p>
                      Version <span className="mono">{p.active_version.slice(0, 6)}</span> is active. Edits to the deal create a new version that everyone signs again.
                    </p>
                    {p.draft && <button className="btn ghost" disabled={busy} onClick={send}>Send the edited deal for signatures</button>}
                  </>
                )}
                {pending && (
                  <>
                    <h3>Waiting for signatures · version <span className="mono">{pending.version.slice(0, 6)}</span></h3>
                    <table className="t">
                      <tbody>
                        {p.members.map((m: any) => (
                          <tr key={m.id}>
                            <td><Who {...m} /></td>
                            <td>{signed(m.id) ? <span className="st succeeded">Signed {when(signed(m.id).signed_at)}</span> : <Status s="pending" />}</td>
                            <td className="num"><a className="small" href={m.sign_link} target="_blank" rel="noreferrer">private link ↗</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="small dim">In a real team each person gets only their own link. The links are shown here so the demo can be run by one person.</p>
                  </>
                )}
                {msg && <p className="err">{msg}</p>}
              </div>
            </div>
          )}
          {pv?.rows && (
            <div className="panel flush">
              <div className="row between" style={{ padding: "10px 14px" }}>
                <h3 style={{ margin: 0 }}>60 sales at {usd(p.product.price_cents)}, before any money exists</h3>
                <span className="small dim">Highlighted rows are where a payback finishes or a cap is reached. Fees here are estimates; real sales use the fee PayPal reports.</span>
              </div>
              <Grid rows={rows} cols={cols} height={460} getRowId={(r) => String(r.data.n)} rowClassRules={{ "sw-edge": (r) => !!r.data?.events }} />
            </div>
          )}
        </>
      )}
      <style>{`.sw-edge { background: #FFF3B8 !important; }`}</style>
    </Shell>
  );
}

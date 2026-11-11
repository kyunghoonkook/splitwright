"use client";
import {useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { AgGridReact } from "ag-grid-react";
import { api, BadLink, RulesStatus, Shell, Status, STATUS_LABEL, usd, useKey, useLeadProject, when, Who } from "@/components/ui";
import { Grid, moneyCol } from "@/components/Grid";

export default function Ledger() {
  const { id } = useParams<{ id: string }>();
  const k = useKey();
  const { data: proj, error } = useLeadProject(id, k);
  const [d, setD] = useState<any>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<any>(null);
  const grid = useRef<AgGridReact>(null);
  const load = useCallback(async () => {
    if (!k) return;
    try {
      setD(await api(`/api/projects/${id}/ledger?k=${k}`));
    } catch {
      /* keep last */
    }
  }, [id, k]);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const members = d?.project?.members ?? [];
  const m = useCallback((mid: string) => members.find((x: any) => x.id === mid) ?? { name: mid, color: "#999" }, [members]);
  const rows = useMemo(() => {
    if (!d) return [];
    return d.sales.flatMap((s: any) =>
      s.lines.map((l: any) => ({
        id: l.id,
        time: s.captured_at,
        capture_id: s.capture_id,
        gross: s.gross_cents,
        fee: s.fee_cents,
        base: s.split_base_cents,
        member: m(l.member_id).name,
        member_id: l.member_id,
        color: m(l.member_id).color,
        how: l.parts.map((p: any) => p.tier_type).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(" + "),
        amount: l.amount_cents,
        status: l.status,
        item: l.payout_item_id ?? "",
        batch: s.payout_batch_id ?? "",
        trace: l.trace,
        steps: s.steps,
        hold_reason: s.hold_reason,
        version: s.rules_version,
        payout_fee: l.payout_fee_cents,
        tx: l.transaction_id,
      })),
    );
  }, [d, m]);

  const cols = useMemo(
    () => [
      { field: "time", headerName: "Captured", width: 140, sort: "desc" as const, valueFormatter: (p: any) => when(p.value), pinned: "left" as const },
      { field: "member", headerName: "To", width: 104, pinned: "left" as const, cellRenderer: (p: any) => <Who name={p.value} color={p.data.color} /> },
      moneyCol("amount", "Amount", { width: 104 }),
      { field: "status", headerName: "Status", width: 140, cellRenderer: (p: any) => <Status s={p.value} />, filterValueGetter: (p: any) => STATUS_LABEL[p.data.status] },
      { field: "how", headerName: "Rule", width: 120 },
      moneyCol("gross", "Sale", { width: 92 }),
      moneyCol("fee", "PayPal fee", { width: 104 }),
      moneyCol("base", "Split base", { width: 108 }),
      { field: "item", headerName: "Payout item", width: 160, cellClass: "mono" },
      { field: "batch", headerName: "Payout batch", width: 150, cellClass: "mono" },
      { field: "capture_id", headerName: "Capture", width: 180, cellClass: "mono" },
    ],
    [],
  );

  if (error) return <BadLink error={error} />;
  return (
    <Shell
      id={id}
      k={k}
      here="/ledger"
      title={proj?.project ? `${proj.project.name}: ledger` : "Loading…"}
      status={<RulesStatus project={proj?.project} />}
      extra={<span className="small">refreshes every 6 s, webhooks update rows</span>}
    >
      <div className="ledger">
        <div className="panel flush">
          <div className="row between" style={{ padding: "10px 14px" }}>
            <input placeholder="Search name, status, ID…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 200px", maxWidth: 320 }} />
            <button className="btn ghost sm" onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "splitwright-ledger.csv" })}>Export CSV</button>
          </div>
          <Grid ref={grid} rows={rows} cols={cols} quickFilter={q} getRowId={(p) => p.data.id} onRowClicked={setSel} height={540} />
        </div>
        <div className="panel stack">
          <h3>How this line was calculated</h3>
          {!sel && <p className="dim">Click a row.</p>}
          {sel && (
            <>
              <div className="row between">
                <Who name={sel.member} color={sel.color} />
                <b className="mono">{usd(sel.amount)}</b>
              </div>
              <Status s={sel.status} />
              <div className="trace">
                {sel.steps.map((s: string, i: number) => <div key={i}>{s}</div>)}
                <div>{sel.member}: {sel.trace}</div>
                {sel.hold_reason && <div style={{ color: "var(--warn)" }}>Held: {sel.hold_reason}</div>}
              </div>
              <div className="small dim mono wrap">
                capture {sel.capture_id}<br />
                {sel.batch && <>batch {sel.batch}<br /></>}
                {sel.item && <>item {sel.item}<br /></>}
                {sel.tx && <>PayPal transaction {sel.tx}<br /></>}
                {sel.payout_fee ? <>payout fee {usd(sel.payout_fee)}<br /></> : null}
                rules v{sel.version}
              </div>
            </>
          )}
          {d && (
            <>
              <hr />
              <h3>Totals by person</h3>
              <table className="t">
                <thead><tr><th>Name</th><th className="num">Earned</th><th className="num">Paid</th><th className="num">Held</th></tr></thead>
                <tbody>
                  {members.map((x: any) => (
                    <tr key={x.id}>
                      <td><Who {...x} /></td>
                      <td className="num">{usd(d.totals.per_member[x.id]?.earned)}</td>
                      <td className="num">{x.id === d.project.owner_id ? "kept" : usd(d.totals.per_member[x.id]?.sent)}</td>
                      <td className="num">{usd(d.totals.per_member[x.id]?.held)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

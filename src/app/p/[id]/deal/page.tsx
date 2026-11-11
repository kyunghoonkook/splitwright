"use client";
import Link from "next/link";
import {useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, BadLink, pct, RulesStatus, Shell, usd, useKey, useLeadProject, Who } from "@/components/ui";

type Rules = { basis: string | null; tiers: any[] };

function Source({ text, quotes }: { text: string; quotes: { tier_index: number; source_text: string }[] }) {
  const parts = useMemo(() => {
    const marks = quotes
      .map((q) => ({ ...q, at: text.indexOf(q.source_text) }))
      .filter((q) => q.at >= 0)
      .sort((a, b) => a.at - b.at);
    const out: React.ReactNode[] = [];
    let pos = 0;
    marks.forEach((m, i) => {
      if (m.at < pos) return;
      out.push(text.slice(pos, m.at));
      out.push(
        <span key={i} style={{ textDecoration: "underline", textDecorationThickness: 2, textUnderlineOffset: 3 }}>
          {m.source_text}
          <sup className="mono" style={{ fontSize: 10, marginLeft: 2 }}>
            {m.tier_index + 1}
          </sup>
        </span>,
      );
      pos = m.at + m.source_text.length;
    });
    out.push(text.slice(pos));
    return out;
  }, [text, quotes]);
  return <div className="source">{parts}</div>;
}

function TierCard({ t, i, members }: { t: any; i: number; members: any[] }) {
  const m = (id: string) => members.find((x) => x.id === id) ?? { name: id, color: "#999" };
  if (t.type === "recoup")
    return (
      <div className="tier">
        <span className="k">Rule {i + 1} · pay back first</span>
        <div>
          <Who {...m(t.payee)} /> gets <b className="mono">{usd(t.amount_cents)}</b> back before any split.
        </div>
      </div>
    );
  const sum = t.shares.reduce((a: number, s: any) => a + s.bps, 0);
  return (
    <div className="tier">
      <span className="k">Rule {i + 1} · split the rest</span>
      <div className="row">
        {t.shares.map((s: any) => (
          <span key={s.payee}>
            <Who {...m(s.payee)} /> <b className="mono">{pct(s.bps)}</b>
          </span>
        ))}
        {sum !== 10000 && <mark className="small">adds up to {pct(sum)}</mark>}
      </div>
      {t.caps.map((c: any) => (
        <div key={c.payee} className="small">
          <Who {...m(c.payee)} /> at most <b className="mono">{usd(c.cap_cents)}</b> from this split. Above the cap:{" "}
          {c.overflow === "pro_rata" ? "to the others by percentage" : c.overflow === "owner" ? `to ${members[0]?.name}` : <mark>not decided</mark>}
        </div>
      ))}
    </div>
  );
}

function Editor({ rules, members, onSave, busy }: { rules: Rules; members: any[]; onSave: (r: Rules) => void; busy: boolean }) {
  const [r, setR] = useState<Rules>(rules);
  useEffect(() => setR(rules), [rules]);
  const set = (fn: (x: Rules) => void) => {
    const c = JSON.parse(JSON.stringify(r));
    fn(c);
    setR(c);
  };
  const split = r.tiers.find((t) => t.type === "split");
  return (
    <div className="stack">
      <label className="f">
        Split on
        <select value={r.basis ?? ""} onChange={(e) => set((x) => (x.basis = e.target.value || null))}>
          <option value="">Not decided</option>
          <option value="net_after_paypal_fee">What is left after PayPal&apos;s fee</option>
          <option value="gross">The full price; the owner pays the fee</option>
        </select>
      </label>
      {r.tiers.map((t, i) =>
        t.type === "recoup" ? (
          <div className="tier" key={i}>
            <div className="row between">
              <span className="k">Rule {i + 1} · pay back first</span>
              <button className="btn ghost sm" onClick={() => set((x) => x.tiers.splice(i, 1))}>
                Remove
              </button>
            </div>
            <div className="row">
              <select value={t.payee} onChange={(e) => set((x) => (x.tiers[i].payee = e.target.value))}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span>gets back $</span>
              <input style={{ width: 100 }} inputMode="decimal" value={(t.amount_cents / 100).toString()} onChange={(e) => set((x) => (x.tiers[i].amount_cents = Math.max(1, Math.round(Number(e.target.value || 0) * 100))))} />
            </div>
          </div>
        ) : (
          <div className="tier" key={i}>
            <span className="k">Rule {i + 1} · split the rest (percent)</span>
            {members.map((m) => {
              const s = t.shares.find((x: any) => x.payee === m.id);
              const c = t.caps.find((x: any) => x.payee === m.id);
              return (
                <div className="row" key={m.id}>
                  <span style={{ width: 70 }}>
                    <Who {...m} />
                  </span>
                  <input style={{ width: 70 }} inputMode="decimal" value={s ? (s.bps / 100).toString() : "0"} onChange={(e) => set((x) => {
                    const tt = x.tiers[i];
                    const v = Math.round(Number(e.target.value || 0) * 100);
                    const ex = tt.shares.find((y: any) => y.payee === m.id);
                    if (ex) ex.bps = v; else tt.shares.push({ payee: m.id, bps: v });
                  })} />
                  <span>%</span>
                  <label className="row small dim">
                    <input type="checkbox" checked={!!c} onChange={(e) => set((x) => {
                      const tt = x.tiers[i];
                      if (e.target.checked) tt.caps.push({ payee: m.id, cap_cents: 30000, overflow: null });
                      else tt.caps = tt.caps.filter((y: any) => y.payee !== m.id);
                    })} />
                    cap
                  </label>
                  {c && (
                    <>
                      <span>$</span>
                      <input style={{ width: 80 }} inputMode="decimal" value={(c.cap_cents / 100).toString()} onChange={(e) => set((x) => (x.tiers[i].caps.find((y: any) => y.payee === m.id).cap_cents = Math.max(1, Math.round(Number(e.target.value || 0) * 100))))} />
                      <select value={c.overflow ?? ""} onChange={(e) => set((x) => (x.tiers[i].caps.find((y: any) => y.payee === m.id).overflow = e.target.value || null))}>
                        <option value="">above cap: not decided</option>
                        <option value="pro_rata">to the others</option>
                        <option value="owner">to {members[0]?.name}</option>
                      </select>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ),
      )}
      <div className="row">
        {!r.tiers.some((t) => t.type === "recoup") && (
          <button className="btn ghost sm" onClick={() => set((x) => x.tiers.unshift({ type: "recoup", payee: members[1]?.id ?? members[0].id, amount_cents: 10000 }))}>
            Add pay-back rule
          </button>
        )}
        {!split && (
          <button className="btn ghost sm" onClick={() => set((x) => x.tiers.push({ type: "split", shares: members.map((m) => ({ payee: m.id, bps: Math.floor(10000 / members.length) })), caps: [] }))}>
            Add percentage split
          </button>
        )}
        <button className="btn sm" disabled={busy} onClick={() => onSave(r)}>
          Save rules
        </button>
      </div>
    </div>
  );
}

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const k = useKey();
  const { data, error, setData } = useLeadProject(id, k);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const p = data?.project;
  const d = p?.draft;
  useEffect(() => {
    if (d && text === null) setText(d.source_text);
  }, [d, text]);

  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r?.project) setData({ ...data, project: r.project });
    } catch (e: any) {
      setMsg(e.message);
      if (e.data?.fallback) setShowEditor(true);
    }
    setBusy(false);
  }

  if (k === null && typeof window !== "undefined" && !window.location.search.includes("k=")) return <BadLink error={null} />;
  if (error) return <BadLink error={error} />;
  const open = d?.questions?.filter((q: any) => !q.answer) ?? [];
  const answered = d?.questions?.filter((q: any) => q.answer) ?? [];
  const hasRules = d && d.rules.tiers.length > 0;

  return (
    <Shell id={id} k={k} here="/deal" title={p ? p.name : "Loading…"} status={<RulesStatus project={p} />}>
      {p && (
        <div className="grid2">
          <div className="stack">
            <div className="panel stack">
              <h3>Team</h3>
              <table className="t">
                <tbody>
                  {p.members.map((m: any, i: number) => (
                    <tr key={m.id}>
                      <td><Who {...m} /></td>
                      <td className="small dim wrap">{m.paypal_email}</td>
                      <td className="small dim">{i === 0 ? "account owner" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel stack">
              <h3>The deal, as you wrote it</h3>
              <textarea value={text ?? ""} onChange={(e) => setText(e.target.value)} placeholder="Paste the message where you agreed how to split the money." />
              <div className="row">
                <button className="btn" disabled={busy || !text || text.length < 10} onClick={() => run(() => api(`/api/projects/${id}/deal/compile?k=${k}`, { method: "POST", body: JSON.stringify({ source_text: text }) }))}>
                  {busy ? "Reading…" : "Turn into rules"}
                </button>
                <button className="btn ghost" onClick={() => setShowEditor((v) => !v)}>
                  {showEditor ? "Hide manual editor" : "Fill in by hand"}
                </button>
              </div>
              {msg && <p className="err">{msg}</p>}
              {d?.compiled_by === "gemini" && hasRules && (
                <>
                  <hr />
                  <h3>Where each rule came from</h3>
                  <Source text={d.source_text} quotes={d.quotes} />
                  <p className="small dim">Read by {d.model}. The model writes rules and questions only. Amounts are computed by plain code.</p>
                </>
              )}
              {d?.notes?.length ? <div className="note">{d.notes.join(" ")}</div> : null}
            </div>
          </div>
          <div className="stack">
            {open.length > 0 && (
              <div className="panel stack">
                <h3>
                  <mark>{open.length} {open.length === 1 ? "thing" : "things"} the deal does not say</mark>
                </h3>
                {open.map((q: any) => (
                  <div className="q" key={q.id}>
                    <b>{q.question}</b>
                    <span className="why">{q.why_it_matters}</span>
                    <div className="opts">
                      {q.options.map((o: any) => (
                        <button key={o.value} className="opt" disabled={busy} onClick={() => run(() => api(`/api/projects/${id}/deal?k=${k}`, { method: "PUT", body: JSON.stringify({ answer: { question_id: q.id, value: o.value } }) }))}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="panel stack">
              <h3>Rules</h3>
              {!hasRules && <p className="dim">No rules yet. Turn the deal into rules, or fill them in by hand.</p>}
              {hasRules && (
                <div className="tier">
                  <span className="k">Basis</span>
                  <div>{d.rules.basis === "net_after_paypal_fee" ? "Split what is left after PayPal's fee." : d.rules.basis === "gross" ? `Split the full price; ${p.members[0].name} pays PayPal's fee.` : <mark>Not decided</mark>}</div>
                </div>
              )}
              {hasRules && d.rules.tiers.map((t: any, i: number) => <TierCard key={i} t={t} i={i} members={p.members} />)}
              {answered.length > 0 && (
                <div className="small dim">
                  Answered:{" "}
                  {answered.map((q: any) => (
                    <div key={q.id}>
                      {q.question} <b>{q.options.find((o: any) => o.value === q.answer)?.label}</b>
                    </div>
                  ))}
                </div>
              )}
              {hasRules && open.length === 0 && (
                <div className="row">
                  <Link className="btn" href={`/p/${id}/preview?k=${k}`}>
                    Preview 60 sales →
                  </Link>
                </div>
              )}
            </div>
            {showEditor && d && (
              <div className="panel stack">
                <h3>Manual editor</h3>
                <Editor rules={d.rules} members={p.members} busy={busy} onSave={(r) => run(() => api(`/api/projects/${id}/deal?k=${k}`, { method: "PUT", body: JSON.stringify({ rules: r, source_text: text ?? "" }) }))} />
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

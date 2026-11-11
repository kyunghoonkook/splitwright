"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export const usd = (c: number | null | undefined) => {
  if (c === null || c === undefined || Number.isNaN(c)) return "—";
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  return `${neg ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
};
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export const STATUS_LABEL: Record<string, string> = {
  succeeded: "Paid",
  pending: "Sending",
  retained: "Kept in account",
  unclaimed: "Unclaimed",
  failed: "Failed",
  held: "Held",
  returned: "Returned",
  blocked: "Blocked",
  active: "Active",
  awaiting_signatures: "Waiting for signatures",
  superseded: "Replaced",
  allocated: "Split, sending",
  paid: "Paid out",
  draft: "Draft",
};
export function Status({ s }: { s: string }) {
  return <span className={`st ${s}`}>{STATUS_LABEL[s] ?? s}</span>;
}
export function Who({ name, color }: { name: string; color: string }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className="sq" style={{ background: color }} />
      {name}
    </span>
  );
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || `Request failed (${r.status})`) as Error & { data?: any };
    e.data = j;
    throw e;
  }
  return j as T;
}

export function useKey() {
  const [k, setK] = useState<string | null>(null);
  useEffect(() => {
    setK(new URLSearchParams(window.location.search).get("k"));
  }, []);
  return k;
}

export function useLeadProject(id: string, k: string | null) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!k) return;
    try {
      setData(await api(`/api/projects/${id}?k=${k}`));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id, k]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load, setData };
}

const NAV = [
  { href: "", label: "Overview" },
  { href: "/deal", label: "Deal" },
  { href: "/preview", label: "Preview & sign" },
  { href: "/ledger", label: "Ledger" },
];

export function Shell({ id, k, here, title, status, children, extra }: { id: string; k: string | null; here: string; title?: string; status?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="rail">
        <Link className="brand" href="/">
          <i />
          Splitwright
        </Link>
        {NAV.map((n) => (
          <Link key={n.href} className={`nav ${here === n.href ? "on" : ""}`} href={`/p/${id}${n.href}?k=${k ?? ""}`}>
            {n.label}
          </Link>
        ))}
        <Link className="nav" href={`/buy/${id}`} target="_blank">
          Product page ↗
        </Link>
        <div className="foot">PayPal sandbox demo. Access is by private link. No real money moves.</div>
      </nav>
      <div className="main">
        <div className="topbar">
          <h1>{title ?? "…"}</h1>
          <div className="meta">
            {status}
            {extra}
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export function RulesStatus({ project }: { project: any }) {
  if (!project) return null;
  if (project.active_version)
    return (
      <span className="row">
        <Status s="active" /> <span className="mono small">v {project.active_version.slice(0, 6)}</span>
        {project.pending_version ? <span className="st awaiting_signatures">new version waiting</span> : null}
      </span>
    );
  if (project.pending_version) return <Status s="awaiting_signatures" />;
  return <Status s="draft" />;
}

export function BadLink({ error }: { error: string | null }) {
  return (
    <div className="plain">
      <div className="panel">
        <h2>Can&apos;t open this page</h2>
        <p className="dim">{error || "This page needs the private link that came with the project."}</p>
        <Link className="btn" href="/">
          Start a demo team
        </Link>
      </div>
    </div>
  );
}

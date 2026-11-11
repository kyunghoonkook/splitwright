"use client";
import {useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, usd } from "@/components/ui";

declare global {
  interface Window {
    paypal?: any;
  }
}

// A small pixel harbor drawn in code (no third-party art).
function HarborArt() {
  const W = 16,
    H = 12;
  const cells: { x: number; y: number; c: string }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = y < 5 ? "#24324a" : y < 7 ? "#2f4f6f" : "#1f5f7a";
      if (y >= 7 && (x + y) % 5 === 0) c = "#3a8fa8";
      if (y === 6 && x > 2 && x < 9) c = "#6b4f3a";
      if (y === 5 && x > 3 && x < 8) c = "#8a6a4f";
      if ((y === 3 || y === 4) && x === 5) c = "#d9d2c3";
      if (y === 2 && x === 5) c = "#ffe066";
      if (y === 4 && x >= 11 && x <= 14) c = "#7a3eb1";
      if (y === 3 && x >= 12 && x <= 13) c = "#d9480f";
      if (y === 1 && (x === 2 || x === 9 || x === 14)) c = "#e6e8e3";
      cells.push({ x, y, c });
    }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="86%" style={{ imageRendering: "pixelated", display: "block" }} aria-label="Pixel harbor preview">
      {cells.map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={p.c} />
      ))}
    </svg>
  );
}

export default function BuyPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);
  const box = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    api(`/api/public/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    if (!d || rendered.current) return;
    rendered.current = true;
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${d.paypal_client_id}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => {
      window.paypal
        ?.Buttons({
          style: { layout: "vertical", color: "black", shape: "rect", label: "pay", height: 44 },
          createOrder: async () => (await api("/api/paypal/orders", { method: "POST", body: JSON.stringify({ project_id: id }) })).id,
          onApprove: async (data: any) => {
            try {
              setDone(await api(`/api/paypal/orders/${data.orderID}/capture`, { method: "POST" }));
            } catch (e: any) {
              setErr(e.message);
            }
          },
          onError: (e: any) => setErr(String(e?.message || e)),
        })
        .render(box.current);
    };
    document.body.appendChild(s);
  }, [d, id]);

  if (err && !d) return <div className="shop"><p className="err">{err}</p></div>;
  if (!d) return <div className="shop"><p className="dim">Loading…</p></div>;
  const m = (mid: string) => d.members.find((x: any) => x.id === mid);
  return (
    <div className="shop">
      <div className="card">
        <div className="art"><HarborArt /></div>
        <div className="info">
          <span className="small dim">{d.members.map((x: any) => x.name).join(", ")}</span>
          <h1>{d.product.title}</h1>
          <p className="dim">{d.product.blurb}</p>
          <div className="price">{usd(d.product.price_cents)}</div>
          {!done && <div ref={box} />}
          {done && (
            <div className="stack">
              <div className="note" style={{ borderLeftColor: "var(--ok)" }}>
                <b>Paid. Thank you.</b> Order <span className="mono">{done.order_id}</span>
              </div>
              <p>This pack was made by {d.members.length} people. What you paid has been split by the rules they all signed{done.sale?.status === "held" ? ", and is waiting for the team to check it" : ""}:</p>
              <div className="flow">
                {(done.sale?.shares ?? []).filter((s: any) => s.share_bps > 0).map((s: any) => (
                  <span key={s.member_id} title={m(s.member_id)?.name} style={{ width: `${s.share_bps / 100}%`, background: m(s.member_id)?.color }} />
                ))}
              </div>
              <div className="row small">
                {(done.sale?.shares ?? []).filter((s: any) => s.share_bps > 0).map((s: any) => (
                  <span key={s.member_id}><span className="sq" style={{ background: m(s.member_id)?.color }} />{m(s.member_id)?.name} {(s.share_bps / 100).toFixed(0)}%</span>
                ))}
              </div>
            </div>
          )}
          {err && <p className="err">{err}</p>}
          <p className="small dim">PayPal sandbox. Use a sandbox buyer account; no real money moves.</p>
        </div>
      </div>
    </div>
  );
}

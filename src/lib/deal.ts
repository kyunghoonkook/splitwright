import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import type { Draft, Member, Project, Question, Quote, Rules, SplitTier } from "./types";
import { estimateFee, pct, rulesProblems, usd } from "./engine";

export const rid = (n = 9) => randomBytes(n).toString("base64url");

// ---------- questions are derived from the rules by code ----------
export function deriveQuestions(rules: Rules, members: Member[], ownerId: string, price: number, aiWording: Partial<Record<string, { question?: string; why?: string }>> = {}, previous: Question[] = []): Question[] {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const owner = name(ownerId);
  const qs: Question[] = [];
  const keep = (q: Question) => {
    const prev = previous.find((p) => p.id === q.id);
    const w = aiWording[q.field];
    qs.push({ ...q, question: w?.question || prev?.question || q.question, why_it_matters: q.why_it_matters, answer: null });
  };
  if (rules.basis !== "gross" && rules.basis !== "net_after_paypal_fee") {
    const fee = estimateFee(price);
    const recoup = rules.tiers.find((t) => t.type === "recoup");
    keep({
      id: "q_basis",
      field: "basis",
      question: recoup ? `Is ${name(recoup.payee)}'s payback and every share taken from the full price, or from what is left after PayPal's fee?` : "Are shares taken from the full price, or from what is left after PayPal's fee?",
      why_it_matters: `On a ${usd(price)} sale PayPal keeps about ${usd(fee)}. Over 100 sales that is about ${usd(fee * 100)} someone has to absorb.`,
      options: [
        { label: "After PayPal's fee", value: "net_after_paypal_fee" },
        { label: `From the full price, ${owner} pays the fee`, value: "gross" },
      ],
    });
  }
  rules.tiers.forEach((t, i) => {
    if (t.type !== "split") return;
    const sum = t.shares.reduce((a, s) => a + s.bps, 0);
    if (sum !== 10000 && t.shares.length) {
      keep({
        id: `q_shares_${i}`,
        field: `tiers.${i}.shares`,
        question: `The percentages add up to ${pct(sum)}. What should happen to the rest?`,
        why_it_matters: `Every sale would leave ${pct(Math.abs(10000 - sum))} of the split unassigned.`,
        options: sum < 10000
          ? [
              { label: `The missing ${pct(10000 - sum)} stays with ${owner}`, value: "owner_rest" },
              { label: "Scale everyone up to 100%", value: "scale" },
            ]
          : [{ label: "Scale everyone down to 100%", value: "scale" }],
      });
    }
    t.caps.forEach((c) => {
      if (c.overflow === "pro_rata" || c.overflow === "owner") return;
      const share = t.shares.find((s) => s.payee === c.payee);
      const perSale = share ? Math.round(((price - estimateFee(price)) * share.bps) / 10000) : 0;
      keep({
        id: `q_overflow_${i}_${c.payee}`,
        field: `tiers.${i}.caps.${c.payee}.overflow`,
        question: `When ${name(c.payee)} reaches the ${usd(c.cap_cents)} cap, where does ${name(c.payee)}'s share of later sales go?`,
        why_it_matters: perSale ? `That is about ${usd(perSale)} per sale after the cap, for as long as the product sells.` : "After the cap, part of every sale has no owner.",
        options: [
          { label: "To the others, by their percentages", value: "pro_rata" },
          { label: `To ${owner}`, value: "owner" },
        ],
      });
    });
  });
  return qs;
}

function scaleBps(shares: SplitTier["shares"]) {
  const sum = shares.reduce((a, s) => a + s.bps, 0) || 1;
  const raw = shares.map((s) => (s.bps * 10000) / sum);
  const fl = raw.map(Math.floor);
  let left = 10000 - fl.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - fl[i] })).sort((a, b) => b.f - a.f).forEach(({ i }) => {
    if (left > 0) {
      fl[i]++;
      left--;
    }
  });
  return shares.map((s, i) => ({ ...s, bps: fl[i] }));
}

export function applyAnswer(rules: Rules, field: string, value: string, ownerId: string): Rules {
  const r: Rules = JSON.parse(JSON.stringify(rules));
  if (field === "basis") {
    if (value === "gross" || value === "net_after_paypal_fee") r.basis = value;
    return r;
  }
  const m = field.match(/^tiers\.(\d+)\.(shares|caps\.([^.]+)\.overflow)$/);
  if (!m) return r;
  const t = r.tiers[Number(m[1])];
  if (!t || t.type !== "split") return r;
  if (m[2] === "shares") {
    if (value === "scale") t.shares = scaleBps(t.shares);
    if (value === "owner_rest") {
      const sum = t.shares.reduce((a, s) => a + s.bps, 0);
      const o = t.shares.find((s) => s.payee === ownerId);
      if (o) o.bps += 10000 - sum;
      else t.shares.push({ payee: ownerId, bps: 10000 - sum });
    }
  } else {
    const c = t.caps.find((x) => x.payee === m[3]);
    if (c && (value === "pro_rata" || value === "owner")) c.overflow = value;
  }
  return r;
}

// ---------- sanitising model output ----------
const AiRules = z.object({
  basis: z.enum(["net_after_paypal_fee", "gross"]).nullable().optional(),
  tiers: z.array(
    z.object({
      type: z.enum(["recoup", "split"]),
      payee: z.string().nullable().optional(),
      amount_cents: z.number().nullable().optional(),
      shares: z.array(z.object({ payee: z.string(), bps: z.number() })).nullable().optional(),
      caps: z.array(z.object({ payee: z.string(), cap_cents: z.number(), overflow: z.enum(["pro_rata", "owner"]).nullable().optional() })).nullable().optional(),
    }),
  ),
});
const AiOut = z.object({
  rules: AiRules,
  open_questions: z.array(z.object({ field: z.string(), question: z.string(), why_it_matters: z.string().optional() })).optional().default([]),
  quotes: z.array(z.object({ tier_index: z.number(), source_text: z.string() })).optional().default([]),
});

export function sanitize(raw: unknown, members: Member[], source: string): { rules: Rules; quotes: Quote[]; wording: Record<string, { question?: string }>; notes: string[] } {
  const notes: string[] = [];
  const parsed = AiOut.safeParse(raw);
  if (!parsed.success) throw new Error("Model output did not match the schema");
  const ids = new Set(members.map((m) => m.id));
  const rules: Rules = { basis: parsed.data.rules.basis ?? null, tiers: [] };
  const map: number[] = [];
  parsed.data.rules.tiers.forEach((t, i) => {
    if (t.type === "recoup") {
      if (!t.payee || !ids.has(t.payee) || !t.amount_cents || t.amount_cents <= 0 || !Number.isInteger(t.amount_cents)) {
        notes.push(`Dropped a payback rule the model could not tie to a team member and a positive amount.`);
        return;
      }
      map[i] = rules.tiers.length;
      rules.tiers.push({ type: "recoup", payee: t.payee, amount_cents: t.amount_cents });
    } else {
      const shares = (t.shares ?? []).filter((s) => ids.has(s.payee) && Number.isFinite(s.bps) && s.bps >= 0).map((s) => ({ payee: s.payee, bps: Math.round(s.bps) }));
      if (shares.length !== (t.shares ?? []).length) notes.push("Dropped a share for someone who is not on the team.");
      const caps = (t.caps ?? []).filter((c) => shares.some((s) => s.payee === c.payee) && c.cap_cents > 0).map((c) => ({ payee: c.payee, cap_cents: Math.round(c.cap_cents), overflow: c.overflow ?? null }));
      map[i] = rules.tiers.length;
      rules.tiers.push({ type: "split", shares, caps });
    }
  });
  // keep only quotes that really appear in the source text
  const quotes = parsed.data.quotes
    .filter((q) => map[q.tier_index] !== undefined && q.source_text.trim().length > 2 && source.includes(q.source_text.trim()))
    .map((q) => ({ tier_index: map[q.tier_index], source_text: q.source_text.trim() }));
  const wording: Record<string, { question?: string }> = {};
  parsed.data.open_questions.forEach((q) => {
    const f = q.field.replace(/^rules\./, "");
    const mm = f.match(/^tiers\.(\d+)\.(.*)$/);
    const key = mm && map[Number(mm[1])] !== undefined ? `tiers.${map[Number(mm[1])]}.${mm[2]}` : f;
    if (q.question.length < 220) wording[key] = { question: q.question };
  });
  return { rules, quotes, wording, notes };
}

// ---------- Gemini ----------
async function gemini(prompt: string): Promise<{ json: unknown; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("No Gemini key configured");
  const models = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-flash-latest").split(",").map((s) => s.trim()).filter(Boolean);
  let last = "";
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      last = `${model}: ${j?.error?.message || r.status}`;
      continue;
    }
    const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    try {
      return { json: JSON.parse(text), model };
    } catch {
      last = `${model}: not JSON`;
    }
  }
  throw new Error(`Gemini unavailable (${last})`);
}

export async function compileDeal(source: string, members: Member[], ownerId: string, price: number) {
  const team = members.map((m) => `- id "${m.id}": ${m.name}${m.id === ownerId ? " (owns the PayPal account the money arrives in)" : ""}`).join("\n");
  const prompt = `You turn a small team's informal revenue-sharing agreement into structured rules. You do NOT decide anything the text does not say.

Team:
${team}
Product price: ${usd(price)} USD per sale. Money arrives in the account owner's PayPal account; PayPal takes a fee from each sale.

Agreement text (verbatim, may be in any language):
"""
${source}
"""

Return JSON only, with this shape:
{
  "rules": {
    "basis": "net_after_paypal_fee" | "gross" | null,   // null unless the text clearly says whether shares/paybacks are computed before or after PayPal's fee
    "tiers": [   // in the order money flows; a payback ("recoup") comes before a percentage split; at most one split and it must be last
      { "type": "recoup", "payee": "<member id>", "amount_cents": <integer> },
      { "type": "split", "shares": [ { "payee": "<member id>", "bps": <integer, 10000 = 100%> } ],
        "caps": [ { "payee": "<member id>", "cap_cents": <integer>, "overflow": "pro_rata" | "owner" | null } ] }   // overflow null unless the text says where money above the cap goes
    ]
  },
  "open_questions": [ { "field": "basis" | "tiers.<i>.shares" | "tiers.<i>.caps.<member id>.overflow", "question": "<one short plain-English question to the team>" } ],
  "quotes": [ { "tier_index": <i>, "source_text": "<exact substring of the agreement that this tier came from>" } ]
}
Rules for you:
- Use only the member ids listed. Amounts in integer cents. Percentages as integer basis points.
- If something is missing or ambiguous, put null and add an open question for that field. Never guess.
- Quotes must be copied character for character from the agreement.`;
  const { json, model } = await gemini(prompt);
  return { ...sanitize(json, members, source), model };
}

export async function aiSummary(rules: Rules, members: Member[], ownerId: string, examples: string[]) {
  const team = members.map((m) => `${m.id}=${m.name}`).join(", ");
  const prompt = `Rewrite these revenue-split rules as at most 5 short plain-English sentences a non-accountant can check. Use names, not ids. Do not add any rule that is not in the JSON. Team: ${team}. Account owner: ${ownerId}.
Rules JSON: ${JSON.stringify(rules)}
Worked examples from the engine:
${examples.join("\n")}
Return JSON: {"lines": ["..."]}`;
  const { json, model } = await gemini(prompt);
  const p = z.object({ lines: z.array(z.string()).min(1).max(6) }).parse(json);
  return { lines: p.lines.map((l) => l.slice(0, 240)), model };
}

export function versionOf(rules: Rules, members: { id: string; paypal_email: string }[]) {
  return createHash("sha256").update(JSON.stringify({ rules, members: members.map((m) => [m.id, m.paypal_email]) })).digest("hex").slice(0, 12);
}

export function emptyDraft(source = ""): Draft {
  return { source_text: source, rules: { basis: null, tiers: [] }, questions: [], quotes: [], compiled_by: "none", updated_at: new Date().toISOString() };
}

export function ruleProblemsFor(p: Project) {
  if (!p.draft) return ["no draft"];
  return rulesProblems(p.draft.rules, p.members);
}

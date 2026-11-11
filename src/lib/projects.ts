import type { Member, Project, RuleSet } from "./types";
import { emptyDraft, rid } from "./deal";
import { getProject, getRuleSet, getToken, saveProject, setToken } from "./store";

export const MEMBER_COLORS = ["#2F6FDE", "#D9480F", "#7A3EB1", "#0F7B6C", "#8C6D1F"];

export const DEMO_DEAL = `Jun paid the $120 music license out of his own pocket, so he gets that back first. After that we split everything Mina 50, Jun 30, Sol 20. Sol only wants $300 in total from this pack.`;

export async function createProject(input: { name: string; product: { title: string; price_cents: number; blurb: string }; members: { name: string; paypal_email: string }[]; source?: string }) {
  const id = rid(6);
  const members: Member[] = input.members.map((m, i) => ({ id: `m${i + 1}`, name: m.name.trim().slice(0, 40), paypal_email: m.paypal_email.trim().toLowerCase(), color: MEMBER_COLORS[i % MEMBER_COLORS.length], token: rid(12) }));
  const p: Project = {
    id,
    name: input.name.trim().slice(0, 60),
    product: input.product,
    owner_id: members[0].id,
    lead_token: members[0].token,
    members,
    draft: emptyDraft(input.source ?? ""),
    pending_version: null,
    active_version: null,
    created_at: new Date().toISOString(),
  };
  await saveProject(p);
  await Promise.all(members.map((m, i) => setToken(m.token, { project_id: id, member_id: m.id, role: i === 0 ? "lead" : "member" })));
  return p;
}

export function demoInput() {
  return {
    name: "Pixel Harbor asset pack",
    product: { title: "Pixel Harbor: 240 tiles, 12 loops", price_cents: 1200, blurb: "A 16x16 harbor-town tileset with animated water and twelve chiptune loops. Made by three people." },
    members: [
      { name: "Mina", paypal_email: process.env.DEMO_MINA_EMAIL || "mina@example.com" },
      { name: "Jun", paypal_email: process.env.DEMO_JUN_EMAIL || "jun@example.com" },
      { name: "Sol", paypal_email: process.env.DEMO_SOL_EMAIL || "sol@example.com" },
    ],
    source: DEMO_DEAL,
  };
}

// Resolve ?k=token into the caller's role for a project.
export async function access(projectId: string, token: string | null) {
  if (!token) return null;
  const ref = await getToken(token);
  if (!ref || ref.project_id !== projectId) return null;
  const p = await getProject(projectId);
  if (!p) return null;
  return { project: p, member: p.members.find((m) => m.id === ref.member_id)!, role: ref.role };
}

export async function byToken(token: string) {
  const ref = await getToken(token);
  if (!ref) return null;
  const p = await getProject(ref.project_id);
  if (!p) return null;
  return { project: p, member: p.members.find((m) => m.id === ref.member_id)!, role: ref.role };
}

export async function activeRules(p: Project): Promise<RuleSet | null> {
  if (!p.active_version) return null;
  return getRuleSet(p.id, p.active_version);
}

// What the browser may see. Tokens of other members are never sent.
export function publicProject(p: Project, viewer: { role: "lead" | "member"; member_id: string } | null) {
  return {
    id: p.id,
    name: p.name,
    product: p.product,
    owner_id: p.owner_id,
    members: p.members.map((m) => ({ id: m.id, name: m.name, color: m.color, paypal_email: viewer ? m.paypal_email : undefined, sign_link: viewer?.role === "lead" ? `/sign/${m.token}` : undefined, me_link: viewer?.role === "lead" || viewer?.member_id === m.id ? `/me/${m.token}` : undefined })),
    draft: viewer?.role === "lead" ? p.draft : null,
    pending_version: p.pending_version,
    active_version: p.active_version,
  };
}

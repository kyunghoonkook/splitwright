import { Redis } from "@upstash/redis";
import type { EngineState, Project, RuleSet, Sale } from "./types";

let _r: Redis | null = null;
export function redis() {
  if (!_r) _r = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
  return _r;
}

const k = {
  project: (id: string) => `sw:p:${id}`,
  token: (t: string) => `sw:tok:${t}`,
  ruleset: (id: string, v: string) => `sw:rs:${id}:${v}`,
  sales: (id: string) => `sw:sales:${id}`,
  sale: (c: string) => `sw:sale:${c}`,
  state: (id: string) => `sw:state:${id}`,
  day: (id: string, d: string) => `sw:day:${id}:${d}`,
  captureSeen: (c: string) => `sw:seen:${c}`,
  webhook: (e: string) => `sw:wh:${e}`,
  lock: (id: string) => `sw:lock:${id}`,
  item: (itemId: string) => `sw:item:${itemId}`,
  order: (o: string) => `sw:order:${o}`,
};

export type TokenRef = { project_id: string; member_id: string; role: "lead" | "member" };

export async function getProject(id: string) {
  return (await redis().get<Project>(k.project(id))) ?? null;
}
export async function saveProject(p: Project) {
  await redis().set(k.project(p.id), p);
}
export async function setToken(t: string, ref: TokenRef) {
  await redis().set(k.token(t), ref);
}
export async function getToken(t: string) {
  return (await redis().get<TokenRef>(k.token(t))) ?? null;
}
export async function getRuleSet(id: string, v: string) {
  return (await redis().get<RuleSet>(k.ruleset(id, v))) ?? null;
}
export async function saveRuleSet(rs: RuleSet) {
  await redis().set(k.ruleset(rs.project_id, rs.version), rs);
}
export async function getState(id: string): Promise<EngineState> {
  return (await redis().get<EngineState>(k.state(id))) ?? { recouped: {}, capped: {} };
}
export async function saveState(id: string, s: EngineState) {
  await redis().set(k.state(id), s);
}
export async function getSale(c: string) {
  return (await redis().get<Sale>(k.sale(c))) ?? null;
}
export async function saveSale(s: Sale, isNew = false) {
  await redis().set(k.sale(s.capture_id), s);
  if (isNew) await redis().lpush(k.sales(s.project_id), s.capture_id);
}
export async function listSales(id: string, n = 200) {
  const ids = await redis().lrange<string>(k.sales(id), 0, n - 1);
  if (!ids.length) return [] as Sale[];
  const rows = await redis().mget<(Sale | null)[]>(...ids.map(k.sale));
  return rows.filter(Boolean) as Sale[];
}
export async function markCaptureSeen(c: string) {
  return (await redis().set(k.captureSeen(c), 1, { nx: true })) === "OK";
}
export async function markWebhookSeen(e: string) {
  return (await redis().set(k.webhook(e), 1, { nx: true, ex: 60 * 60 * 24 * 30 })) === "OK";
}
export async function getPaidToday(id: string, day: string) {
  return Number((await redis().get<number>(k.day(id, day))) ?? 0);
}
export async function addPaidToday(id: string, day: string, c: number) {
  await redis().incrby(k.day(id, day), c);
  await redis().expire(k.day(id, day), 60 * 60 * 48);
}
export async function mapItem(itemId: string, captureId: string) {
  await redis().set(k.item(itemId), captureId);
}
export async function itemCapture(itemId: string) {
  return (await redis().get<string>(k.item(itemId))) ?? null;
}
export async function mapOrder(orderId: string, projectId: string) {
  await redis().set(k.order(orderId), projectId, { ex: 60 * 60 * 24 * 7 });
}
export async function orderProject(orderId: string) {
  return (await redis().get<string>(k.order(orderId))) ?? null;
}

export async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const key = k.lock(id);
  for (let i = 0; i < 50; i++) {
    const ok = await redis().set(key, 1, { nx: true, px: 15000 });
    if (ok === "OK") {
      try {
        return await fn();
      } finally {
        await redis().del(key);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Project is busy, try again");
}

export const today = () => new Date().toISOString().slice(0, 10);

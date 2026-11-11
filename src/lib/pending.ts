import { getRuleSet, saveRuleSet } from "./store";
import type { Project } from "./types";

export async function dropPending(p: Project) {
  if (!p.pending_version) return;
  const rs = await getRuleSet(p.id, p.pending_version);
  if (rs && rs.status === "awaiting_signatures") {
    rs.status = "superseded";
    await saveRuleSet(rs);
  }
  p.pending_version = null;
}


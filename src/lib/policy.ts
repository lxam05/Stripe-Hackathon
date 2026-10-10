import { getDb } from "./db";
import { DEFAULT_PREAPPROVED, mccInfo, MCC_TABLE, type EventType, type MccPolicyAction } from "./mcc";

export interface ResolvedPolicy {
  action: MccPolicyAction;
  preapproved: EventType[];
  source: "society" | "global" | "default";
}

/** Society override → global (Societies Office) → built-in default. */
export function resolvePolicy(societyId: string, mcc: string): ResolvedPolicy {
  const rows = getDb()
    .prepare(
      `SELECT scope, action, event_types_preapproved FROM mcc_policy
       WHERE mcc = ? AND ((scope='society' AND scope_id=?) OR scope='global')`,
    )
    .all(mcc, societyId) as { scope: string; action: MccPolicyAction; event_types_preapproved: string }[];
  const soc = rows.find((r) => r.scope === "society");
  const glob = rows.find((r) => r.scope === "global");
  // A society can never un-block something the Societies Office blocks globally.
  if (glob?.action === "block") return { action: "block", preapproved: [], source: "global" };
  const r = soc ?? glob;
  if (r) {
    return {
      action: r.action,
      preapproved: JSON.parse(r.event_types_preapproved),
      source: soc ? "society" : "global",
    };
  }
  return {
    action: mccInfo(mcc).defaultPolicy,
    preapproved: DEFAULT_PREAPPROVED[mcc] ?? [],
    source: "default",
  };
}

export function globalBlockedMccs(): string[] {
  return (
    getDb().prepare(`SELECT mcc FROM mcc_policy WHERE scope='global' AND action='block'`).all() as {
      mcc: string;
    }[]
  ).map((r) => r.mcc);
}

export function seedGlobalPolicy() {
  const ins = getDb().prepare(
    `INSERT OR REPLACE INTO mcc_policy (scope, scope_id, mcc, action, event_types_preapproved) VALUES ('global','',?,?,?)`,
  );
  for (const m of MCC_TABLE) {
    if (m.defaultPolicy === "allow") continue;
    ins.run(m.code, m.defaultPolicy, JSON.stringify(DEFAULT_PREAPPROVED[m.code] ?? []));
  }
}

export function setPolicy(
  scope: "global" | "society",
  scopeId: string,
  mcc: string,
  action: MccPolicyAction,
  preapproved: EventType[] = [],
) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO mcc_policy (scope, scope_id, mcc, action, event_types_preapproved) VALUES (?,?,?,?,?)`,
    )
    .run(scope, scope === "global" ? "" : scopeId, mcc, action, JSON.stringify(preapproved));
}

export function listPolicies(scope: "global" | "society", scopeId = "") {
  return getDb()
    .prepare(`SELECT * FROM mcc_policy WHERE scope=? AND scope_id=? ORDER BY action, mcc`)
    .all(scope, scope === "global" ? "" : scopeId) as {
    mcc: string;
    action: MccPolicyAction;
    event_types_preapproved: string;
  }[];
}

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

// One SQLite file. All money is stored as integer cents.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS society (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  plan_status TEXT NOT NULL DEFAULT 'none',          -- none | active | expired
  plan_renews_at TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,                                -- treasurer | events_officer | chair | secretary | pro | committee
  member_ref TEXT NOT NULL UNIQUE,                   -- pseudonym sent to JEV
  stripe_cardholder_id TEXT,
  cardholder_created_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                                -- social | academic | sport | trip | other
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  expected_attendees INTEGER NOT NULL DEFAULT 0,
  budget_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',               -- open | closed
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Officer cards: up to 5 live cards per society, one per committee member.
-- event_id is the open event the card is currently spending for (NULL = general spending).
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  member_id TEXT NOT NULL REFERENCES member(id),
  event_id TEXT REFERENCES event(id),
  network TEXT NOT NULL,                             -- stripe (test double only in disposable tests)
  stripe_card_id TEXT UNIQUE,
  last4 TEXT NOT NULL,
  exp_month INTEGER NOT NULL,
  exp_year INTEGER NOT NULL,
  status TEXT NOT NULL,                              -- pending | active | inactive | canceled
  status_reason TEXT,
  per_auth_cap_cents INTEGER NOT NULL,
  monthly_limit_cents INTEGER NOT NULL,
  restriction_profile TEXT NOT NULL DEFAULT 'standard',
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS card_society ON card(society_id, status);

CREATE TABLE IF NOT EXISTS ledger_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  society_id TEXT NOT NULL REFERENCES society(id),
  event_id TEXT,
  type TEXT NOT NULL,                                -- topup | adjustment | auth_hold | hold_release | spend | refund
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_society ON ledger_entry(society_id, type);
CREATE INDEX IF NOT EXISTS ledger_event ON ledger_entry(event_id, type);

CREATE TABLE IF NOT EXISTS topup (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  payer_type TEXT NOT NULL,                          -- sponsor | ucd
  payer_name TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  show_publicly INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL,
  checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL,                              -- pending | paid | canceled
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS authorization (
  id TEXT PRIMARY KEY,
  stripe_auth_id TEXT UNIQUE,
  card_id TEXT NOT NULL REFERENCES card(id),
  event_id TEXT,                                     -- NULL = general society spending
  society_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_key TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'eur',
  mcc TEXT NOT NULL,
  mcc_group TEXT NOT NULL,
  merchant_city TEXT NOT NULL DEFAULT '',
  merchant_country TEXT NOT NULL,
  created_at TEXT NOT NULL,                          -- purchase time (UTC ISO)
  decision TEXT NOT NULL,                            -- approved | declined
  decline_reason TEXT,
  rules_score INTEGER NOT NULL,
  rule_signals TEXT NOT NULL,                        -- JSON
  status TEXT NOT NULL,                              -- pending | closed | reversed | declined
  captured_cents INTEGER NOT NULL DEFAULT 0,
  decision_ms REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'live'                -- live | seed
);
CREATE INDEX IF NOT EXISTS auth_card_time ON authorization(card_id, created_at);
CREATE INDEX IF NOT EXISTS auth_society_time ON authorization(society_id, created_at);

CREATE TABLE IF NOT EXISTS txn (
  id TEXT PRIMARY KEY,
  stripe_txn_id TEXT UNIQUE,
  authorization_id TEXT NOT NULL REFERENCES authorization(id),
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL,                                -- capture | refund
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_assessment (
  id TEXT PRIMARY KEY,
  authorization_id TEXT NOT NULL REFERENCES authorization(id),
  source TEXT NOT NULL,                              -- jev | rules_fallback
  status TEXT NOT NULL DEFAULT 'done',               -- pending | done
  model TEXT,
  prompt_version TEXT,
  risk_score INTEGER,
  risk_level TEXT,
  flags TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  recommended_action TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  fallback_reason TEXT,
  action_taken TEXT,
  raw TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ra_auth ON risk_assessment(authorization_id, created_at);

CREATE TABLE IF NOT EXISTS flag (
  id TEXT PRIMARY KEY,
  authorization_id TEXT NOT NULL UNIQUE REFERENCES authorization(id),
  severity TEXT NOT NULL,                            -- low | medium | high
  status TEXT NOT NULL DEFAULT 'open',               -- open | legit | receipt_requested | fraud
  reason TEXT NOT NULL DEFAULT '',
  card_frozen INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolution_note TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS society_mcc_stats (
  society_id TEXT NOT NULL,
  mcc_group TEXT NOT NULL,
  n INTEGER NOT NULL,
  mean_log REAL NOT NULL,
  sd_log REAL NOT NULL,
  median_cents INTEGER NOT NULL,
  PRIMARY KEY (society_id, mcc_group)
);

CREATE TABLE IF NOT EXISTS mcc_policy (
  scope TEXT NOT NULL,                               -- global | society
  scope_id TEXT NOT NULL DEFAULT '',
  mcc TEXT NOT NULL,
  action TEXT NOT NULL,                              -- block | review | allow
  event_types_preapproved TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (scope, scope_id, mcc)
);

-- Simulator time override for Stripe-mode test authorisations, read by the webhook.
CREATE TABLE IF NOT EXISTS sim_override (
  card_id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_event (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS synthetic_label (
  authorization_id TEXT PRIMARY KEY,
  is_anomaly INTEGER NOT NULL,
  anomaly_type TEXT,
  eval_set INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eval_result (
  run_id TEXT NOT NULL,
  config TEXT NOT NULL,                              -- jev_only
  authorization_id TEXT NOT NULL,
  model TEXT NOT NULL,
  risk_level TEXT,
  risk_score INTEGER,
  recommended_action TEXT,
  summary TEXT,
  confidence REAL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER,
  cost_usd REAL,
  repeat_idx INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  status TEXT NOT NULL,                              -- queued | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(kind, ref_id)
);

CREATE TABLE IF NOT EXISTS payment_review (
  authorization_id TEXT PRIMARY KEY REFERENCES authorization(id),
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL,
  mandate_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS recurring_mandate (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  member_id TEXT NOT NULL REFERENCES member(id),
  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  min_cents INTEGER NOT NULL,
  max_cents INTEGER NOT NULL,
  cadence TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  approved_from TEXT NOT NULL REFERENCES authorization(id),
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mandate_match ON recurring_mandate(society_id, member_id, merchant_key, status);
CREATE TABLE IF NOT EXISTS expense (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  member_id TEXT NOT NULL REFERENCES member(id),
  event_id TEXT REFERENCES event(id),
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  purpose TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  incurred_on TEXT NOT NULL,
  receipt_name TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  receipt BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  payment_reference TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS expense_society ON expense(society_id, member_id, status);
CREATE TABLE IF NOT EXISTS grant_report (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  evidence TEXT NOT NULL,
  narrative TEXT NOT NULL,
  estimate_cents INTEGER NOT NULL,
  draft_source TEXT NOT NULL,
  council_notes TEXT NOT NULL DEFAULT '',
  approved_cents INTEGER,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  UNIQUE(society_id, year)
);
CREATE TABLE IF NOT EXISTS card_slot_purchase (
  id TEXT PRIMARY KEY,
  society_id TEXT NOT NULL REFERENCES society(id),
  checkout_session_id TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
`;

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __balanceDb?: DB };

function open(): DB {
  const file = path.resolve(process.cwd(), env.dbPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  // Additive migrations: never silently discard a user's local ledger.
  const cardCols = db.prepare(`PRAGMA table_info(card)`).all() as { name: string }[];
  if (cardCols.length && !cardCols.some((c) => c.name === "monthly_limit_cents")) {
    db.exec(`ALTER TABLE card ADD COLUMN monthly_limit_cents INTEGER NOT NULL DEFAULT 300000`);
  }
  if (cardCols.length && !cardCols.some((c) => c.name === "restriction_profile")) {
    db.exec(`ALTER TABLE card ADD COLUMN restriction_profile TEXT NOT NULL DEFAULT 'standard'`);
  }
  db.exec(SCHEMA);
  const authCols = db.prepare(`PRAGMA table_info(authorization)`).all() as { name: string }[];
  if (!authCols.some((c) => c.name === "merchant_key")) db.exec(`ALTER TABLE authorization ADD COLUMN merchant_key TEXT NOT NULL DEFAULT ''`);
  if (!authCols.some((c) => c.name === "currency")) db.exec(`ALTER TABLE authorization ADD COLUMN currency TEXT NOT NULL DEFAULT 'eur'`);
  return db;
}

function dropAll(db: DB) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  db.pragma("foreign_keys = OFF");
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.pragma("foreign_keys = ON");
}

export function getDb(): DB {
  if (!globalForDb.__balanceDb) globalForDb.__balanceDb = open();
  return globalForDb.__balanceDb;
}

export function resetDb() {
  const db = getDb();
  dropAll(db);
  db.exec(SCHEMA);
}

export const nowIso = () => new Date().toISOString();

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

export function audit(actor: string, action: string, target: string, details: object = {}) {
  getDb()
    .prepare(`INSERT INTO audit_log (actor, action, target, details, at) VALUES (?,?,?,?,?)`)
    .run(actor, action, target, JSON.stringify(details), nowIso());
}

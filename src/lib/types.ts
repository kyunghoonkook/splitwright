// Shared types. All money is integer cents (USD).

export type Basis = "net_after_paypal_fee" | "gross";
export type Overflow = "pro_rata" | "owner";

export interface RecoupTier {
  type: "recoup";
  payee: string;
  amount_cents: number;
}

export interface Share {
  payee: string;
  bps: number; // basis points, 10000 = 100%
}

export interface Cap {
  payee: string;
  cap_cents: number;
  overflow: Overflow | null;
}

export interface SplitTier {
  type: "split";
  shares: Share[];
  caps: Cap[];
}

export type Tier = RecoupTier | SplitTier;

export interface Rules {
  basis: Basis | null;
  tiers: Tier[];
}

export interface Member {
  id: string;
  name: string;
  paypal_email: string;
  color: string;
  token: string;
}

export interface Question {
  id: string;
  field: string; // "basis" | "tiers.{i}.caps.{payee}.overflow" | "tiers.{i}.shares"
  question: string;
  why_it_matters: string;
  options: { label: string; value: string }[];
  answer?: string | null;
}

export interface Quote {
  tier_index: number;
  source_text: string;
}

export interface Draft {
  source_text: string;
  rules: Rules;
  questions: Question[];
  quotes: Quote[];
  compiled_by: "gemini" | "manual" | "none";
  model?: string;
  notes?: string[];
  updated_at: string;
}

export type RuleStatus = "awaiting_signatures" | "active" | "superseded";

export interface RuleSet {
  version: string;
  project_id: string;
  source_text: string;
  rules: Rules;
  summary: string[];
  summary_by: "gemini" | "engine";
  members: { id: string; name: string; paypal_email: string }[];
  owner_id: string;
  status: RuleStatus;
  signatures: { member_id: string; signed_at: string }[];
  created_at: string;
  activated_at?: string;
}

export interface Product {
  title: string;
  price_cents: number;
  blurb: string;
}

export interface Project {
  id: string;
  name: string;
  product: Product;
  owner_id: string;
  lead_token: string;
  members: Member[];
  draft: Draft | null;
  pending_version: string | null; // awaiting signatures
  active_version: string | null;
  daily_limit_cents?: number;
  created_at: string;
}

// Running totals the engine needs between sales.
export interface EngineState {
  recouped: Record<string, number>; // key `${tierIndex}` -> cents already paid back
  capped: Record<string, number>; // key `${tierIndex}:${payee}` -> cents received in a capped split tier
}

export type LineStatus = "retained" | "pending" | "succeeded" | "unclaimed" | "failed" | "held" | "returned" | "blocked";

export interface Line {
  id: string; // `${capture_id}:${member_id}`
  capture_id: string;
  member_id: string;
  amount_cents: number;
  parts: { tier_index: number; tier_type: "recoup" | "split" | "overflow" | "fee" | "remainder"; amount_cents: number }[];
  trace: string;
  status: LineStatus;
  payout_batch_id?: string;
  payout_item_id?: string;
  payout_fee_cents?: number;
  transaction_id?: string;
}

export interface Sale {
  capture_id: string;
  order_id: string;
  project_id: string;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  split_base_cents: number;
  rules_version: string | null;
  status: "allocated" | "held" | "paid";
  hold_reason: string | null;
  captured_at: string;
  payout_batch_id?: string;
  batch_status?: string;
  lines: Line[];
  steps: string[]; // trace of the whole sale
}

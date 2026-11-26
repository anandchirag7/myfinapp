import type { MatchSource } from "@/lib/statement-clusters";
import type { EconomicType } from "@/lib/statement-domain";
import type { RecurringCandidate } from "@/lib/statement-recurring";
import type { CorrectionScope } from "@/lib/statement-corrections";

/** A single parsed statement transaction pending review. */
export type ReviewRow = {
  key: string;
  date: string;
  description: string;
  pattern: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  payee: string;
  category_id: string | null;
  source: MatchSource;
  confidence: number;
  include: boolean;
  duplicate: boolean;
  transfer_account_id?: string | null;
  statement_direction?: "debit" | "credit";
  economic_type?: EconomicType;
  economic_confidence?: number;
  economic_source?: string;
  economic_reasons?: string[];
  source_fingerprint?: string;
  source_row_number?: number;
  value_date?: string | null;
  original_reference?: string | null;
  debit?: number | null;
  credit?: number | null;
  closing_balance?: number | null;
  raw_cells?: Array<string | number | boolean | null>;
  payment_rail?: string;
  destination_account_id?: string | null;
  canonical_entity_id?: string | null;
  processor_entity_id?: string | null;
  recurring_candidate?: RecurringCandidate;
  economic_correction_scope?: CorrectionScope;
  /** Why this row was flagged as a duplicate (match keys + confidence). */
  dup?: DuplicateEvidence;
};

/** Human-readable explanation of a duplicate collision. */
export type DuplicateEvidence = {
  scope: "file" | "account";
  confidence: number;
  matchKeys: string[];
  reason: string;
  existing?: { date: string; amount: number; merchant: string | null; note: string | null };
};

export type Category = { id: string; name: string; parent_id: string | null };

export type RowFilter = "all" | "included" | "excluded" | "lowConfidence" | "duplicates";

/** Shared grid template so header, rows and skeletons stay aligned. */
export const ROW_GRID =
  "grid grid-cols-[28px_64px_minmax(0,1fr)_minmax(0,180px)_minmax(0,150px)_110px_92px] items-center gap-2 px-2";

export const ROW_HEIGHT = 46;

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const fmtDate = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};

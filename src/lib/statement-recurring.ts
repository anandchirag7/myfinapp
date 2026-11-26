export type RecurringObservation = {
  key: string;
  date: string;
  amount: number;
  direction: "debit" | "credit";
  providerKey: string;
  mandateReference?: string | null;
};

export type RecurringCandidate = {
  key: string;
  providerKey: string;
  mandateReference: string | null;
  expectedAmount: number;
  amountTolerance: number;
  cadence: "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";
  expectedDay: number | null;
  windowDays: number;
  observationKeys: string[];
  confidence: number;
  firstObservedOn: string;
  lastObservedOn: string;
};

const dayMs = 86_400_000;

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function cadenceOf(dates: number[]): RecurringCandidate["cadence"] {
  if (dates.length < 2) return "irregular";
  const gaps = dates.slice(1).map((date, index) => Math.round((date - dates[index]!) / dayMs));
  const typical = median(gaps);
  if (typical >= 5 && typical <= 9) return "weekly";
  if (typical >= 25 && typical <= 36) return "monthly";
  if (typical >= 75 && typical <= 105) return "quarterly";
  if (typical >= 340 && typical <= 390) return "yearly";
  return "irregular";
}

function normalizedProvider(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Finds statement-observed mandates without grouping on merchant alone.
 * Reference is preferred; otherwise amount becomes part of the identity.
 */
export function detectRecurringCandidates(
  observations: RecurringObservation[],
): RecurringCandidate[] {
  const groups = new Map<string, RecurringObservation[]>();
  for (const observation of observations) {
    if (observation.direction !== "debit" || observation.amount <= 0) continue;
    const provider = normalizedProvider(observation.providerKey);
    if (!provider) continue;
    const reference = String(observation.mandateReference ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const identity = reference || `AMOUNT:${observation.amount.toFixed(2)}`;
    const key = `${provider}::${identity}`;
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const timestamps = sorted.map((row) => Date.parse(`${row.date}T00:00:00Z`));
    if (timestamps.some(Number.isNaN)) continue;
    const cadence = cadenceOf(timestamps);
    if (cadence === "irregular") continue;
    const amounts = sorted.map((row) => row.amount);
    const expectedAmount = Math.round(median(amounts) * 100) / 100;
    const amountTolerance = Math.round(Math.max(...amounts.map((amount) => Math.abs(amount - expectedAmount))) * 100) / 100;
    const days = sorted.map((row) => new Date(`${row.date}T00:00:00Z`).getUTCDate());
    const expectedDay = cadence === "monthly" || cadence === "quarterly" || cadence === "yearly"
      ? Math.round(median(days))
      : null;
    const windowDays = expectedDay == null ? 0 : Math.min(15, Math.max(1, ...days.map((day) => Math.abs(day - expectedDay))));
    const mandateReference = sorted[0]!.mandateReference?.trim() || null;
    candidates.push({
      key,
      providerKey: normalizedProvider(sorted[0]!.providerKey),
      mandateReference,
      expectedAmount,
      amountTolerance,
      cadence,
      expectedDay,
      windowDays,
      observationKeys: sorted.map((row) => row.key),
      confidence: mandateReference ? 0.99 : 0.9,
      firstObservedOn: sorted[0]!.date,
      lastObservedOn: sorted.at(-1)!.date,
    });
  }
  return candidates.sort((a, b) => a.key.localeCompare(b.key));
}

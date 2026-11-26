import { performance } from "node:perf_hooks";
import { extractRowsFromAOA } from "../src/lib/statement-parse.server";
import { resolveEconomicType } from "../src/lib/statement-economic-resolver";
import { statementSourceFingerprint } from "../src/lib/statement-source-fingerprint";
import { withConcurrency } from "../src/lib/statement-normalize";

const header = [
  "Date",
  "Narration",
  "Chq./Ref.No.",
  "Value Dt",
  "Withdrawal Amt.",
  "Deposit Amt.",
  "Closing Balance",
];

function fixture(size: number): unknown[][] {
  const rows: unknown[][] = [["Synthetic HDFC performance fixture"], [], header];
  let balance = 1_000_000;
  for (let index = 0; index < size; index += 1) {
    const day = (index % 28) + 1;
    const month = (Math.floor(index / 28) % 12) + 1;
    const year = 2020 + (Math.floor(index / 336) % 7);
    const date = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
    const credit = index % 20 === 0;
    const amount = (index % 5000) + 1;
    balance += credit ? amount : -amount;
    rows.push([
      date,
      credit
        ? `INTEREST PAID-REF${String(index).padStart(12, "0")}`
        : `UPI-MERCHANT ${index % 500}-MERCHANT${index % 500}@YBL-HDFC0000001-${String(index).padStart(12, "0")}-PAYMENT`,
      String(index).padStart(16, "0"),
      date,
      credit ? null : amount,
      credit ? amount : null,
      Math.round(balance * 100) / 100,
    ]);
  }
  return rows;
}

for (const size of [1_000, 10_000, 100_000]) {
  const started = performance.now();
  const parsed = extractRowsFromAOA(fixture(size));
  const parsedAt = performance.now();
  const resolved = parsed.map((row) =>
    resolveEconomicType({
      description: row.description,
      direction: row.direction!,
      amount: row.amount,
    }),
  );
  const resolvedAt = performance.now();
  const fingerprints = await withConcurrency(parsed, 32, statementSourceFingerprint);
  const finished = performance.now();
  if (parsed.length !== size || resolved.length !== size || fingerprints.length !== size) {
    throw new Error(`Row loss at ${size}: parsed=${parsed.length}, resolved=${resolved.length}, fingerprints=${fingerprints.length}`);
  }
  console.log(
    JSON.stringify({
      rows: size,
      parseMs: Math.round(parsedAt - started),
      resolveMs: Math.round(resolvedAt - parsedAt),
      fingerprintMs: Math.round(finished - resolvedAt),
      totalMs: Math.round(finished - started),
      heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    }),
  );
}

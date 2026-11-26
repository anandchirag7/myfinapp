/**
 * Server-only statement parsing: deterministic CSV/Excel extraction plus
 * AI-assisted PDF extraction. Shared by the legacy import flow and the
 * fast upload pipeline.
 */

export type ExtractedTxn = {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  direction?: "debit" | "credit";
  valueDate?: string | null;
  reference?: string | null;
  debit?: number | null;
  credit?: number | null;
  closingBalance?: number | null;
  sourceRowNumber?: number;
  rawCells?: Array<string | number | boolean | null>;
};

function serializableCell(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

/**
 * Recover a JSON object from a possibly-truncated LLM response.
 */
export function salvageJson(raw: string): any | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const s = raw.slice(start);
  const st: string[] = [];
  let inStr = false,
    esc = false,
    lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{" || c === "[") {
      st.push(c);
      continue;
    }
    if (c === "}" || c === "]") {
      st.pop();
      lastSafe = i + 1;
      continue;
    }
    if (c === "," && st.length > 0) lastSafe = i;
  }
  if (lastSafe <= 0) return null;
  const truncated = s.slice(0, lastSafe);
  const stack2: string[] = [];
  let inS = false,
    es = false;
  for (let i = 0; i < truncated.length; i++) {
    const c = truncated[i];
    if (inS) {
      if (es) es = false;
      else if (c === "\\") es = true;
      else if (c === '"') inS = false;
      continue;
    }
    if (c === '"') inS = true;
    else if (c === "{" || c === "[") stack2.push(c);
    else if (c === "}" || c === "]") stack2.pop();
  }
  let closed = truncated;
  for (let i = stack2.length - 1; i >= 0; i--) closed += stack2[i] === "{" ? "}" : "]";
  try {
    return JSON.parse(closed);
  } catch {
    return null;
  }
}

// ---------- Deterministic CSV/Excel row extraction ----------

const DATE_KEYS = [
  "date",
  "txn date",
  "transaction date",
  "value date",
  "posting date",
  "post date",
  "tran date",
  "trans date",
  "booking date",
];
const DESC_KEYS = [
  "description",
  "narration",
  "particulars",
  "details",
  "transaction details",
  "remarks",
  "narrative",
  "reference",
  "memo",
  "payee",
];
const DEBIT_KEYS = [
  "debit",
  "withdrawal",
  "withdrawal amount",
  "debit amount",
  "dr",
  "amount debit",
  "money out",
  "paid out",
  "spent",
];
const CREDIT_KEYS = [
  "credit",
  "deposit",
  "deposit amount",
  "credit amount",
  "cr",
  "amount credit",
  "money in",
  "paid in",
  "received",
];
const AMOUNT_KEYS = ["amount", "transaction amount", "amt", "value"];
const TYPE_KEYS = [
  "type",
  "dr/cr",
  "cr/dr",
  "drcr",
  "transaction type",
  "debit / credit",
  "debit/credit",
  "dr / cr",
  "cr / dr",
  "debit or credit",
  "dr or cr",
  "cr or dr",
];
const VALUE_DATE_KEYS = ["value date", "value dt", "val date"];
const REFERENCE_KEYS = [
  "chq./ref.no.",
  "chq/ref no",
  "chq ref no",
  "reference no",
  "transaction reference",
  "utr",
];
const BALANCE_KEYS = ["closing balance", "balance", "running balance", "available balance"];

function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ");
}

function parseNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // (123.45) => -123.45
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[()₹$€£¥,\s]/g, "").replace(/-$/, "");
  // strip currency codes
  s = s.replace(/^(inr|usd|eur|gbp|rs\.?)/i, "");
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  // Excel numeric date
  if (typeof v === "number" && v > 20000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let [_, a, b, y] = m;
    let yr = Number(y);
    if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    // Assume DD/MM/YYYY (Indian). If a > 12, definitely day.
    let day = Number(a),
      mon = Number(b);
    if (mon > 12 && day <= 12) {
      const t = day;
      day = mon;
      mon = t;
    }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  // DD-Mon-YYYY
  const m2 = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{2,4})/);
  if (m2) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const idx = months.indexOf(m2[2].slice(0, 3).toLowerCase());
    if (idx >= 0) {
      let yr = Number(m2[3]);
      if (yr < 100) yr += yr < 50 ? 2000 : 1900;
      return `${yr}-${String(idx + 1).padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function findKey(headers: string[], candidates: string[]): string | null {
  const nh = headers.map((h) => norm(h));
  for (const cand of candidates) {
    const i = nh.findIndex((h) => (h ?? "") === cand);
    if (i >= 0) return headers[i];
  }
  for (const cand of candidates) {
    const i = nh.findIndex((h) => (h ?? "").includes(cand));
    if (i >= 0) return headers[i];
  }
  return null;
}

/** Detect the header row in a sheet: pick the row that maximises known-column matches. */
function detectHeader(rows: any[][]): { headerIdx: number; headers: string[] } | null {
  let best = { idx: -1, score: 0, headers: [] as string[] };
  const scan = Math.min(rows.length, 25);
  for (let i = 0; i < scan; i++) {
    const row = (rows[i] ?? []).map((c) => String(c ?? "").trim());
    if (row.filter(Boolean).length < 3) continue;
    const nh = row.map(norm);
    let score = 0;
    const has = (arr: string[]) => arr.some((a) => nh.some((h) => h === a || h.includes(a)));
    if (has(DATE_KEYS)) score += 2;
    if (has(DESC_KEYS)) score += 2;
    if (has(DEBIT_KEYS)) score += 1;
    if (has(CREDIT_KEYS)) score += 1;
    if (has(AMOUNT_KEYS)) score += 1;
    if (score > best.score) best = { idx: i, score, headers: row };
  }
  if (best.score < 3) return null;
  return { headerIdx: best.idx, headers: best.headers };
}

export function extractRowsFromAOA(aoa: any[][]): ExtractedTxn[] {
  const det = detectHeader(aoa);
  if (!det) return [];
  const { headerIdx, headers } = det;
  const dateKey = findKey(headers, DATE_KEYS);
  const descKey = findKey(headers, DESC_KEYS);
  const debitKey = findKey(headers, DEBIT_KEYS);
  const creditKey = findKey(headers, CREDIT_KEYS);
  const amountKey = findKey(headers, AMOUNT_KEYS);
  const typeKey = findKey(headers, TYPE_KEYS);
  const valueDateKey = findKey(headers, VALUE_DATE_KEYS);
  const referenceKey = findKey(headers, REFERENCE_KEYS);
  const balanceKey = findKey(headers, BALANCE_KEYS);
  if (!dateKey || !descKey || (!debitKey && !creditKey && !amountKey)) return [];

  const idx = (k: string | null) => (k ? headers.indexOf(k) : -1);
  const di = idx(dateKey),
    ei = idx(descKey),
    dbi = idx(debitKey),
    cri = idx(creditKey),
    ai = idx(amountKey),
    ti = idx(typeKey),
    vdi = idx(valueDateKey),
    ri = idx(referenceKey),
    bi = idx(balanceKey);

  const out: ExtractedTxn[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const date = parseDate(row[di]);
    const desc = String(row[ei] ?? "").trim();
    if (!date || !desc) continue;

    let amount: number | null = null;
    let type: "income" | "expense" | "transfer" = "expense";
    let debit: number | null = null;
    let credit: number | null = null;

    if (dbi >= 0 || cri >= 0) {
      debit = dbi >= 0 ? parseNumber(row[dbi]) : null;
      credit = cri >= 0 ? parseNumber(row[cri]) : null;
      if (debit && Math.abs(debit) > 0) {
        amount = Math.abs(debit);
        type = "expense";
      } else if (credit && Math.abs(credit) > 0) {
        amount = Math.abs(credit);
        type = "income";
      }
    }
    if (amount == null && ai >= 0) {
      const n = parseNumber(row[ai]);
      if (n != null && n !== 0) {
        amount = Math.abs(n);
        let foundType = false;
        if (ti >= 0) {
          const tv = norm(row[ti]);
          if (tv.startsWith("cr") || tv.includes("credit") || tv.includes("income")) {
            type = "income";
            foundType = true;
          } else if (tv.startsWith("dr") || tv.includes("debit") || tv.includes("expense")) {
            type = "expense";
            foundType = true;
          }
        }
        if (!foundType) {
          // Check explicit Cr tag in type column, last cell, or row text
          const lastCell = String(row[row.length - 1] ?? "")
            .trim()
            .toLowerCase();
          const rowStr = row.map((c) => String(c ?? "").trim()).join(" ");

          const isExplicitCr =
            lastCell === "cr" ||
            lastCell === "credit" ||
            /\bcr\b/i.test(rowStr) ||
            /cr$/i.test(rowStr.trim()) ||
            /\bcredit\b/i.test(rowStr);

          if (isExplicitCr) {
            type = "income";
          } else {
            type = "expense";
          }
        }
      }
    }
    if (amount == null || amount === 0) continue;

    // Skip balance / opening rows
    const dl = desc.toLowerCase();
    if (
      dl.includes("opening balance") ||
      dl.includes("closing balance") ||
      dl === "b/f" ||
      dl === "c/f"
    )
      continue;

    out.push({
      date,
      valueDate: vdi >= 0 ? parseDate(row[vdi]) : null,
      description: desc,
      reference: ri >= 0 ? String(row[ri] ?? "").trim() || null : null,
      debit: debit == null ? null : Math.abs(debit),
      credit: credit == null ? null : Math.abs(credit),
      closingBalance: bi >= 0 ? parseNumber(row[bi]) : null,
      amount,
      direction: type === "income" ? "credit" : "debit",
      type,
      sourceRowNumber: r + 1,
      rawCells: Array.from(row, serializableCell),
    });
  }
  return out;
}

// ---------- PDF: deterministic table extraction + parallel Euri AI fallback ----------

const PDF_AMOUNT_RE = /^(?:(?:INR|RS\.?|₹)\s*)?(\d{1,3}(?:,\d{2,3})*\.\d{2}|\d+\.\d{2})(?:\s*(CR|DR))?$/i;
const PDF_LEADING_DATE_RE =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[\-\s][A-Za-z]{3,}[\-\s]\d{2,4})(?:\s+(.*))?$/;
const PDF_NOISE_LINE_RE =
  /^(?:page\s+\d+(?:\s+of\s+\d+)?|statement\s+of\s+account|account\s+statement|generated\s+on|date\s*\|\s*narration|txn\s+date|transaction\s+date|opening\s+balance|closing\s+balance|dr\s+count|cr\s+count|total\s+debits?|total\s+credits?|brought\s+forward|carried\s+forward|contents\s+of\s+this\s+statement|this\s+is\s+a\s+computer\s+generated|nomination|total\b|\*\*+end\s+of\s+statement)/i;
const PDF_SUMMARY_STOP_RE =
  /^(?:statement\s+summary|account\s+summary|\*\*+\s*end\s+of\s+statement)/i;

function parsePdfAmountCell(cell: string): { value: number; tag: "cr" | "dr" | null } | null {
  const m = cell.trim().match(PDF_AMOUNT_RE);
  if (!m) return null;
  const value = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  const tag = m[2] ? (m[2].toLowerCase() as "cr" | "dr") : null;
  return { value, tag };
}

export function extractPdfRowsDeterministic(pages: string[]): ExtractedTxn[] {
  const lines = pages
    .flatMap((page) => page.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);

  let prevBalance: number | null = null;
  const blocks: Array<{ date: string; cells: string[]; rowNumber: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/opening\s+balance/i.test(line)) {
      const cells = line.split(/\s*\|\s*/);
      for (const c of cells) {
        const amt = parsePdfAmountCell(c);
        if (amt && amt.value > 0) prevBalance = amt.value;
      }
      continue;
    }
    if (blocks.length > 0 && PDF_SUMMARY_STOP_RE.test(line)) break;
    if (PDF_NOISE_LINE_RE.test(line)) continue;

    const rawCells = line.split(/\s*\|\s*/).map((c) => c.trim()).filter(Boolean);
    if (!rawCells.length) continue;

    const first = rawCells[0]!;
    const leadMatch = first.match(PDF_LEADING_DATE_RE);
    const parsedDate = leadMatch ? parseDate(leadMatch[1]) : parseDate(first);

    if (parsedDate) {
      const restOfFirst = leadMatch?.[2]?.trim();
      const cells = [
        ...(restOfFirst ? [restOfFirst] : []),
        ...rawCells.slice(1),
      ];
      blocks.push({ date: parsedDate, cells, rowNumber: i + 1 });
    } else if (blocks.length > 0 && blocks[blocks.length - 1]!.cells.length < 18) {
      // Append wrapped narration/amount lines to the active transaction block.
      const prev = blocks[blocks.length - 1]!;
      const prevHasAmount = prev.cells.some((c) => parsePdfAmountCell(c) !== null);
      const curHasAmount = rawCells.some((c) => parsePdfAmountCell(c) !== null);
      if (!prevHasAmount || !curHasAmount) {
        prev.cells.push(...rawCells);
      }
    }
  }

  const out: ExtractedTxn[] = [];
  for (const block of blocks) {
    const amounts: Array<{ value: number; tag: "cr" | "dr" | null }> = [];
    const descParts: string[] = [];
    let valueDate: string | null = null;
    let reference: string | null = null;

    for (const cell of block.cells) {
      const amt = parsePdfAmountCell(cell);
      if (amt) {
        amounts.push(amt);
        continue;
      }
      const d = parseDate(cell);
      if (d && !valueDate) {
        valueDate = d;
        continue;
      }
      if (!reference && /^[A-Z0-9]{8,22}$/i.test(cell) && /\d{4,}/.test(cell)) {
        reference = cell;
        descParts.push(cell);
        continue;
      }
      descParts.push(cell);
    }

    const description = descParts.join(" ").replace(/\s+/g, " ").trim();
    if (!description || !amounts.length || amounts.length > 3) continue;
    if (/\b(?:statement\s+summary|opening\s+balance|closing\s+balance|total\s+debits?|total\s+credits?)\b/i.test(description)) {
      continue;
    }

    let amount = 0;
    let direction: "debit" | "credit" = "debit";
    let closingBalance: number | null = null;

    if (amounts.length >= 3) {
      const d = amounts[0]!.value;
      const c = amounts[1]!.value;
      closingBalance = amounts[amounts.length - 1]!.value;
      if (c > 0 && d === 0) {
        amount = c;
        direction = "credit";
      } else {
        amount = d > 0 ? d : c;
        direction = d > 0 ? "debit" : "credit";
      }
    } else if (amounts.length === 2) {
      amount = amounts[0]!.value;
      closingBalance = amounts[1]!.value;
      if (amounts[0]!.tag === "cr") {
        direction = "credit";
      } else if (amounts[0]!.tag === "dr") {
        direction = "debit";
      } else if (prevBalance !== null) {
        if (Math.abs(prevBalance + amount - closingBalance) <= 0.05) {
          direction = "credit";
        } else if (Math.abs(prevBalance - amount - closingBalance) <= 0.05) {
          direction = "debit";
        } else if (/\b(CR|CREDIT|SALARY|REFUND|REVERSAL|CASHBACK|INTEREST|DIVIDEND)\b/i.test(description)) {
          direction = "credit";
        }
      } else if (/\b(CR|CREDIT|SALARY|REFUND|REVERSAL|CASHBACK|INTEREST|DIVIDEND)\b/i.test(description)) {
        direction = "credit";
      }
    } else {
      amount = amounts[0]!.value;
      if (
        amounts[0]!.tag === "cr" ||
        /\b(CR|CREDIT|PAYMENT RECEIVED|REFUND|REVERSAL|CASHBACK|SALARY)\b/i.test(description)
      ) {
        direction = "credit";
      }
    }

    if (closingBalance !== null) prevBalance = closingBalance;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    out.push({
      date: block.date,
      description,
      amount,
      type: direction === "credit" ? "income" : "expense",
      direction,
      valueDate,
      reference,
      debit: direction === "debit" ? amount : null,
      credit: direction === "credit" ? amount : null,
      closingBalance,
      sourceRowNumber: block.rowNumber,
      rawCells: [block.date, ...block.cells].map(serializableCell),
    });
  }

  return out;
}

export async function parsePdfWithAI(
  base64: string,
  fileName: string,
  bank: string,
  categoryList: string,
  payeeList: string,
  _apiKey?: string,
  pdfPassword?: string,
): Promise<{ transactions: ExtractedTxn[] }> {
  const { extractPdfText, chunkPdfPages } = await import("./pdf-extract.server");
  const { createEuriClient } = await import("./euri.server");
  const { withConcurrency } = await import("./statement-normalize");

  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  const { pages } = await extractPdfText(bytes, pdfPassword);

  // Fast path: deterministic layout-based table parser (~10ms, zero LLM timeout risk).
  const deterministic = extractPdfRowsDeterministic(pages);
  if (deterministic.length > 0) {
    return { transactions: deterministic };
  }

  // Fallback: parallelized Euri AI extraction for non-standard PDF layouts.
  const chunks = chunkPdfPages(pages, 8_000);
  if (!chunks.length) {
    return { transactions: [] };
  }

  const systemPrompt = `You extract bank/credit-card statement transactions from extracted PDF statement text.
File: ${fileName}
Bank: ${bank}
Available categories: ${categoryList}
Existing memorized payees: ${payeeList || "(none)"}

Return ONLY valid JSON:
{ "transactions": [ { "date": "YYYY-MM-DD", "description": "raw narration", "amount": 1234.56, "type": "income" | "expense" | "transfer" } ] }
Rules:
- amount is always positive
- money out / debit / withdrawal => expense, money in / credit / deposit => income, own-account moves => transfer
- Ignore opening/closing balance summaries, headers, footers, and page numbers
- Do not invent transactions`;

  const client = createEuriClient({ timeoutMs: 35_000, retries: 1 });
  const chunkResults = await withConcurrency(chunks, 4, async (chunkText) => {
    const response = await client.chat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Extract every transaction from these statement pages:\n\n${chunkText}`,
        },
      ],
      { format: "json", temperature: 0, numPredict: 4096 },
    );
    const content = response.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = salvageJson(content) ?? { transactions: [] };
    }
    const txns = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const items: ExtractedTxn[] = [];
    for (const t of txns) {
      if (!t?.date || !t?.description || t?.amount == null) continue;
      const amt = Math.abs(Number(t.amount));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      items.push({
        date: String(t.date).slice(0, 10),
        description: String(t.description).trim(),
        amount: amt,
        type: (t.type as any) ?? "expense",
      });
    }
    return items;
  });

  return { transactions: chunkResults.flat() };
}

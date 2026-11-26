import { extractText, extractTextItems, getDocumentProxy, type StructuredTextItem } from "unpdf";

export type PdfPasswordErrorCode = "required" | "incorrect";

export class PdfPasswordError extends Error {
  constructor(
    public readonly code: PdfPasswordErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfPasswordError";
  }
}

export function formatStructuredPdfPage(items: StructuredTextItem[]): string {
  if (!items.length) return "";
  // Group text items into visual rows by Y coordinate (within 2.5pt tolerance).
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2.5) return b.y - a.y;
    return a.x - b.x;
  });

  const rows: StructuredTextItem[][] = [];
  for (const item of sorted) {
    const text = item.str.trim();
    if (!text) continue;
    const currentRow = rows[rows.length - 1];
    if (!currentRow || Math.abs(currentRow[0]!.y - item.y) > 2.5) {
      rows.push([item]);
    } else {
      currentRow.push(item);
    }
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let line = "";
      let prevRight = -1;
      for (const item of row) {
        const text = item.str.trim();
        if (!text) continue;
        if (prevRight >= 0) {
          const gap = item.x - prevRight;
          line += gap > 14 ? " | " : " ";
        }
        line += text;
        prevRight = item.x + (item.width || 0);
      }
      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function isPasswordException(error: unknown): { isPassword: boolean; incorrect: boolean } {
  const err = error as { name?: string; code?: number; message?: string } | null;
  if (!err) return { isPassword: false, incorrect: false };
  const msg = String(err.message ?? "").toLowerCase();
  if (err.name === "PasswordException" || msg.includes("password")) {
    return {
      isPassword: true,
      incorrect: err.code === 2 || msg.includes("incorrect"),
    };
  }
  return { isPassword: false, incorrect: false };
}

/**
 * Decrypts (if password provided) and extracts page-by-page table-preserving text from a PDF.
 * Throws PdfPasswordError("required" | "incorrect") when password is missing or wrong.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  password?: string,
): Promise<{ totalPages: number; pages: string[] }> {
  const cleanPassword = password?.trim() ? password : undefined;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes, cleanPassword ? { password: cleanPassword } : undefined);
  } catch (error) {
    const pwd = isPasswordException(error);
    if (pwd.isPassword) {
      if (pwd.incorrect || cleanPassword) {
        throw new PdfPasswordError(
          "incorrect",
          "PDF_INCORRECT_PASSWORD: Incorrect PDF password. Please check and try again.",
        );
      }
      throw new PdfPasswordError(
        "required",
        "PDF_PASSWORD_REQUIRED: This PDF is password protected. Please enter the password.",
      );
    }
    throw error;
  }

  try {
    const structured = await extractTextItems(pdf);
    const pages = structured.items.map(formatStructuredPdfPage);
    if (pages.some((p) => p.length > 0)) {
      return { totalPages: structured.totalPages, pages };
    }
    const fallback = await extractText(pdf, { mergePages: false });
    return {
      totalPages: fallback.totalPages,
      pages: Array.isArray(fallback.text) ? fallback.text : [String(fallback.text ?? "")],
    };
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

export function chunkPdfPages(pages: string[], maxChars = 14_000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i]?.trim();
    if (!pageText) continue;
    const block = `--- Page ${i + 1} ---\n${pageText}`;
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

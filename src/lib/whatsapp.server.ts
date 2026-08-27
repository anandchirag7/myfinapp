// Server-only helper to send WhatsApp messages via Twilio.
// Returns { ok, sid?, error? }. Silently returns { ok: false, error: "not_configured" }
// when Twilio credentials are missing so the reminder job can no-op gracefully.
//
// For production, configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM
// to use Twilio's API directly. This implementation currently stubs as not_configured
// since the Lovable connector gateway has been removed.

export interface SendWhatsAppInput {
  to: string;           // E.164 with or without leading +
  body: string;
}

function normalizeTo(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/^0+/, "")}`;
  return `whatsapp:${withPlus}`;
}

function normalizeFrom(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/^0+/, "")}`;
  return `whatsapp:${withPlus}`;
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "not_configured" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: normalizeTo(input.to),
        From: normalizeFrom(from),
        Body: input.body,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `provider_${response.status}: ${text.slice(0, 300)}` };
    }

    const data: any = await response.json().catch(() => ({}));
    return { ok: true, sid: data?.sid };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown_error" };
  }
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

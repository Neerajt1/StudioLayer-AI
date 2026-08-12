import { logger } from "../../lib/logger.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { ok: true; mode: "resend"; id: string }
  | { ok: true; mode: "log" }
  | { ok: false; error: string };

function emailFromAddress(): string | null {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  return null;
}

function resendApiKey(): string | null {
  const configured = process.env.RESEND_API_KEY?.trim();
  if (configured) return configured;
  return null;
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const from = emailFromAddress();
  const apiKey = resendApiKey();

  if (!apiKey || !from) {
    logger.info(
      {
        to: input.to,
        subject: input.subject,
        mode: "log",
      },
      "Transactional email skipped — provider not configured",
    );
    return { ok: true, mode: "log" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        {
          to: input.to,
          subject: input.subject,
          status: response.status,
          errorBody,
        },
        "Transactional email delivery failed",
      );
      return {
        ok: false,
        error: `Email provider returned ${response.status}`,
      };
    }

    const payload = (await response.json()) as { id?: string };
    return {
      ok: true,
      mode: "resend",
      id: payload.id ?? "unknown",
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        to: input.to,
        subject: input.subject,
      },
      "Transactional email delivery failed",
    );
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}

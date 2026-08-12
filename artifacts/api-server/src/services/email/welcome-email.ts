import { logger } from "../../lib/logger.js";
import { sendTransactionalEmail } from "./send-email.js";

const WELCOME_SUBJECT = "Welcome to StudioLayer AI";

function welcomeEmailHtml(name: string): string {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#faf9f7;color:#2d2d2d;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <p style="margin:0 0 16px;font-size:18px;line-height:1.5;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
        Welcome to <strong>StudioLayer AI</strong>. Your Studio account has been successfully created.
      </p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
        StudioLayer AI is a creative platform for fashion and design workflows — built to help you
        explore, refine, and produce editorial-quality imagery with clarity and control.
      </p>
      <p style="margin:0;font-size:16px;line-height:1.6;">
        Sign in when you are ready and start exploring your Studio workspace.
      </p>
      <p style="margin:32px 0 0;font-size:14px;line-height:1.6;color:#6b6b6b;">
        — StudioLayer AI
      </p>
    </div>
  </body>
</html>`;
}

function welcomeEmailText(name: string): string {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";

  return `${greeting}

Welcome to StudioLayer AI. Your Studio account has been successfully created.

StudioLayer AI is a creative platform for fashion and design workflows — built to help you explore, refine, and produce editorial-quality imagery with clarity and control.

Sign in when you are ready and start exploring your Studio workspace.

— StudioLayer AI`;
}

export async function sendWelcomeEmail(input: {
  email: string;
  name: string;
}): Promise<void> {
  const result = await sendTransactionalEmail({
    to: input.email,
    subject: WELCOME_SUBJECT,
    html: welcomeEmailHtml(input.name),
    text: welcomeEmailText(input.name),
  });

  if (!result.ok) {
    logger.warn(
      {
        to: input.email,
        subject: WELCOME_SUBJECT,
        error: result.error,
      },
      "Welcome email could not be delivered — account creation was still successful",
    );
    return;
  }

  logger.info(
    {
      to: input.email,
      subject: WELCOME_SUBJECT,
      mode: result.mode,
      ...(result.mode === "resend" ? { messageId: result.id } : {}),
    },
    "Welcome email sent",
  );
}

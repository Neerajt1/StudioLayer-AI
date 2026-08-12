import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const originalFetch = globalThis.fetch;
const originalResendKey = process.env.RESEND_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
    if (originalEmailFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalEmailFrom;
    }
  });

  it("does not throw when email provider is not configured", async () => {
    const { sendWelcomeEmail } = await import("./welcome-email.js");

    await assert.doesNotReject(async () => {
      await sendWelcomeEmail({
        email: "creator@example.com",
        name: "Alex Rivera",
      });
    });
  });

  it("sends welcome email to the registered address when provider is configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "StudioLayer AI <welcome@studiolayerai.com>";

    let capturedBody: {
      to?: string[];
      subject?: string;
      html?: string;
      text?: string;
    } | null = null;
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { sendWelcomeEmail } = await import("./welcome-email.js");

    await sendWelcomeEmail({
      email: "creator@example.com",
      name: "Alex Rivera",
    });

    assert.ok(capturedBody);
    assert.deepEqual(capturedBody.to, ["creator@example.com"]);
    assert.equal(capturedBody.subject, "Welcome to StudioLayer AI");
    assert.match(String(capturedBody.html), /successfully created/i);
    assert.doesNotMatch(String(capturedBody.text), /password/i);
  });

  it("does not throw when provider delivery fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "StudioLayer AI <welcome@studiolayerai.com>";

    globalThis.fetch = (async () =>
      new Response("provider unavailable", { status: 503 })) as typeof fetch;

    const { sendWelcomeEmail } = await import("./welcome-email.js");

    await assert.doesNotReject(async () => {
      await sendWelcomeEmail({
        email: "creator@example.com",
        name: "Alex Rivera",
      });
    });
  });
});

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { refreshAdminProviderUsage } from "./admin-provider-usage.js";

describe("refreshAdminProviderUsage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["OPENROUTER_API_KEY"] = "";
    process.env["FAL_KEY"] = "";
    process.env["OPENAPI_API_KEY"] = "";
    process.env["RAILWAY_API_TOKEN"] = "";
    process.env["NEON_API_KEY"] = "";
    process.env["CLOUDFLARE_API_TOKEN"] = "";
    process.env["GITHUB_TOKEN"] = "";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("returns mixed provider results without failing the snapshot", async () => {
    process.env["OPENROUTER_API_KEY"] = "test-openrouter-key";
    process.env["GITHUB_TOKEN"] = "ghp_testtoken1234567890";

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai/api/v1/key")) {
        return new Response(
          JSON.stringify({
            data: {
              limit_remaining: 12.5,
              usage_monthly: 3.25,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("api.github.com/rate_limit")) {
        return new Response(
          JSON.stringify({
            resources: {
              core: { limit: 5000, remaining: 4821, reset: 1_755_000_000 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const snapshot = await refreshAdminProviderUsage();

    assert.equal(snapshot.providers.length, 7);
    assert.equal(snapshot.providers[0]?.status, "healthy");
    assert.match(snapshot.providers[0]?.information ?? "", /\$12\.50 remaining/);
    assert.equal(snapshot.providers[1]?.status, "not_configured");
    assert.equal(snapshot.providers[6]?.status, "healthy");
    assert.match(snapshot.providers[6]?.information ?? "", /4,821 \/ 5,000/);

    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes("test-openrouter-key"), false);
    assert.equal(serialized.includes("ghp_testtoken"), false);
  });

  it("marks authentication failures as down with safe detail", async () => {
    process.env["FAL_KEY"] = "test-fal-key";

    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    const snapshot = await refreshAdminProviderUsage();
    const fal = snapshot.providers.find((provider) => provider.key === "fal");
    assert.equal(fal?.status, "down");
    assert.equal(fal?.detail, "Authentication failed");
  });
});

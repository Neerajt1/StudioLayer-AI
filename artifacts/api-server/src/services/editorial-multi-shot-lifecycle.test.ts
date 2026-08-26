import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const providerSrc = readFileSync(
  join(__dirname, "rendering/providers/OpenRouterProvider.ts"),
  "utf8",
);
const pipelineSrc = readFileSync(
  join(__dirname, "ai-pipeline.ts"),
  "utf8",
);
const rendersSrc = readFileSync(
  join(__dirname, "../routes/renders.ts"),
  "utf8",
);
const studioSrc = readFileSync(
  join(__dirname, "../../../studiolayer-ai/src/pages/studio.tsx"),
  "utf8",
);

describe("Editorial multi-shot lifecycle (shots = 2)", () => {
  it("1. two independent shot indexes are fanned out in Stage 1 and Stage 2", () => {
    assert.match(providerSrc, /Array\.from\(\{ length: shots \}/);
    assert.match(providerSrc, /const stage1Results = await Promise\.all/);
    assert.match(providerSrc, /results = await Promise\.all/);
    assert.match(providerSrc, /const stage1Url = stage1Results\[i\]/);
    assert.match(providerSrc, /if \(!stage1Url\) return Promise\.resolve\(null\)/);
  });

  it("2. Stage 1 shot 0 failure does not block Stage 1 shot 1 (per-shot catch → null)", () => {
    assert.match(
      providerSrc,
      /run\(\)\.then\(resolve\)\.catch\(\(\) => resolve\(null\)\)/,
    );
    assert.match(providerSrc, /\.map\(\(url, i\) => \(url \? \{ url, index: i \}/);
  });

  it("3. Stage 2 only starts for indexes with a Stage-1 URL", () => {
    assert.match(providerSrc, /if \(!stage1Url\) return Promise\.resolve\(null\)/);
    assert.match(providerSrc, /"flash",\s*\n\s*2,\s*\n\s*stage1Url/s);
  });

  it("4. onComplete is invoked per uploaded image index in ai-pipeline", () => {
    assert.match(pipelineSrc, /await params\.onComplete\(/);
    assert.match(pipelineSrc, /image\.index/);
  });

  it("5. failed generation indexes call onShotError without onComplete", () => {
    assert.match(pipelineSrc, /await params\.onShotError\(/);
    assert.match(pipelineSrc, /settledShotIndices\.has\(i\)/);
  });

  it("6. upload failure on one shot does not abort the sibling upload loop", () => {
    assert.match(pipelineSrc, /shot upload failed — marking row as failed/);
    assert.match(pipelineSrc, /settledShotIndices\.add\(image\.index\)/);
    assert.match(
      pipelineSrc,
      /try \{[\s\S]*await uploadBase64Image[\s\S]*await params\.onComplete[\s\S]*\} catch \(uploadError\)/,
    );
  });

  it("7. Stage-1 intermediate images never reach onComplete (provider filters nulls)", () => {
    assert.match(providerSrc, /\.filter\(\(img\): img is GeneratedImage => img !== null\)/);
    assert.doesNotMatch(rendersSrc, /createStage:\s*1/);
    assert.doesNotMatch(rendersSrc, /stage1Url/);
  });

  it("8. finalize uses completedCount only — single Create transaction preserved", () => {
    assert.equal(
      (rendersSrc.match(/await beginGenerationCreditTransaction/g) ?? []).length,
      1,
    );
    assert.match(rendersSrc, /completedCount: batchTracker\.completed/);
    assert.match(rendersSrc, /batchTracker\.completed \+ batchTracker\.failed >= shots/);
  });
});

describe("Retry semantics (documented — no slot retry exists)", () => {
  it("9. Workspace Try Again calls full handleRender / createRender.mutate", () => {
    assert.match(studioSrc, /onRetry=\{canCreate && !isGenerationBusy \? handleRender/);
    assert.match(studioSrc, /createRender\.mutate\(\s*\{ data: renderingRequest \}/);
    assert.match(studioSrc, /setActiveRenderIds\(\[\]\)/);
  });

  it("10. POST /api/renders always inserts a fresh generationSessionId batch", () => {
    assert.match(rendersSrc, /for \(let i = 0; i < shots; i\+\+\)/);
    assert.match(rendersSrc, /generationSessionId/);
    assert.match(rendersSrc, /randomUUID\(\)/);
  });

  it("11. onComplete ignores late success when row is no longer active", () => {
    assert.match(rendersSrc, /onComplete ignored — render is no longer an active generation/);
    assert.match(rendersSrc, /inArray\(rendersTable\.status, \[\.\.\.ACTIVE_GENERATION_STATUSES\]\)/);
  });

  it("12. finalizeCreditTransaction is idempotent via batchTracker.finalized", () => {
    assert.match(rendersSrc, /if \(batchTracker\.finalized \|\| !creditTransactionId\) return/);
  });
});

describe("Delayed completion safeguards", () => {
  it("13. abort does not retry upstream OpenRouter (orphan guard)", () => {
    const lifecycleSrc = readFileSync(
      join(__dirname, "generation-lifecycle.ts"),
      "utf8",
    );
    assert.match(lifecycleSrc, /Do not retry aborted fetches/);
    assert.match(lifecycleSrc, /isOpenRouterAbortError/);
  });

  it("14. stale generations reconcile on Gallery list fetch", () => {
    assert.match(rendersSrc, /scheduleDeferredCommercialReconciliation\(userId\)/);
  });
});

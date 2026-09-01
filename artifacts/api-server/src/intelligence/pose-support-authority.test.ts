// ---------------------------------------------------------------------------
// Pose ↔ support authority in the emitted shot prompt.
//
// Pose 7 drifted into a conventional chair sit because the auto-selected path
// emitted a generic "directly facing / centred" camera direction ahead of the
// Pose Master contract, and because the derived body↔support relationship was
// computed but never reached the prompt. These tests pin both.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GarmentProfile } from "./types";
import { buildShotPromptAtSlot } from "./pose-selection-engine";

const PROFILE = {
  category: "top",
  subcategory: "shirt",
  colour: ["black"],
  fit: "regular",
  fabric: "cotton",
  gender: "female",
  styleTags: [],
  tags: [],
} as unknown as GarmentProfile;

const BASE_PROMPT =
  "Professional fashion photograph. Natural standing pose, balanced posture, neutral expression. Pure white seamless studio background.";

function autoPrompt(poseName: string): string {
  return buildShotPromptAtSlot(
    BASE_PROMPT,
    PROFILE,
    "hero",
    poseName as never,
    0,
  );
}

function manualPrompt(poseName: string): string {
  return buildShotPromptAtSlot(BASE_PROMPT, PROFILE, "hero", poseName as never, 0, {
    manualDirected: true,
  });
}

describe("auto-selected shot direction cannot contradict the Pose Master", () => {
  it("Pose 7 no longer asserts a directly-facing, centred body direction", () => {
    const prompt = autoPrompt("Pose7");
    assert.ok(!/directly facing the model/i.test(prompt));
    assert.ok(!/Model centred/i.test(prompt));
  });

  it("legitimate framing requirements survive", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(prompt, /Camera position: Eye level/);
    assert.match(prompt, /Full-body framing from head to feet/);
    assert.match(prompt, /SHOT DIRECTION — HERO PRODUCT SHOWCASE/);
  });

  it("pose authority precedes the generic shot direction", () => {
    const prompt = autoPrompt("Pose7");
    const pose = prompt.indexOf("POSE & ACTION DIRECTION");
    const direction = prompt.indexOf("SHOT DIRECTION —");
    assert.ok(pose >= 0 && direction > pose);
  });

  it("the shot direction is labelled photography-only on both paths", () => {
    for (const prompt of [autoPrompt("Pose7"), manualPrompt("Pose7")]) {
      assert.match(
        prompt,
        /SHOT DIRECTION — .*\(photography and styling only — not body pose\)/,
      );
    }
  });
});

describe("Pose 7 keeps its canonical Pose Master contract", () => {
  it("retains the structured definition and geometric anchors", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(prompt, /POSE MASTER STRUCTURED DEFINITION:/);
    assert.match(
      prompt,
      /POSE 7 GEOMETRIC ANCHORS \(AUTHORITATIVE — do not dilute/,
    );
  });

  it("Pose Master remains the sole authority for body geometry", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(
      prompt,
      /Reference Image 3 is the Pose Master visual geometry for BODY POSE AND ACTION only/,
    );
    assert.match(
      prompt,
      /The Pose Master remains the sole authority for body pose, limb placement, camera, framing, and composition/,
    );
  });
});

describe("body ↔ support relationship reaches the prompt", () => {
  it("Pose 7 states the backrest top/back-edge support surface", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(prompt, /BODY ↔ SUPPORT RELATIONSHIP \(pose authority/);
    assert.match(prompt, /Support surface: Chair backrest top\/back edge/);
    assert.match(prompt, /seat is not the support/i);
  });

  it("Pose 7 explicitly forbids conversion to a conventional seat sit", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(prompt, /not a conventional seat sit/);
    assert.match(
      prompt,
      /Do not convert this into conventional sitting on the seat/,
    );
  });

  it("the support layer claims no furniture, identity, or garment authority", () => {
    const prompt = autoPrompt("Pose7");
    assert.match(
      prompt,
      /does not govern furniture appearance, identity, or garment/,
    );
  });

  it("both auto and manual paths carry the support relationship", () => {
    assert.match(manualPrompt("Pose7"), /BODY ↔ SUPPORT RELATIONSHIP/);
  });

  it("a conventional seated pose gains no support layer", () => {
    const prompt = autoPrompt("Pose31");
    assert.ok(!/BODY ↔ SUPPORT RELATIONSHIP/.test(prompt));
    assert.ok(!/conventional seat sit/.test(prompt));
    assert.match(prompt, /POSE MASTER STRUCTURED DEFINITION:/);
  });
});

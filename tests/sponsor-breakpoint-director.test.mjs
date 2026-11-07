import test from "node:test";
import assert from "node:assert/strict";
import { selectSponsorBreakpoints } from "../src/lib/raye2/sponsor-breakpoint-director.mjs";

test("selects high-confidence natural breakpoints and orders them chronologically", () => {
  const result = selectSponsorBreakpoints({
    durationSeconds: 1800,
    maxBreaks: 3,
    minSpacingSeconds: 240,
    candidates: [
      { atSeconds: 900, source: "scene_transition", confidence: 0.82 },
      { atSeconds: 420, source: "chapter", confidence: 0.95 },
      { atSeconds: 1400, source: "dialogue_gap", confidence: 0.92 }
    ]
  });
  assert.deepEqual(result.map(x => x.atSeconds), [420, 900, 1400]);
  assert.equal(result[0].resumeContextFromSeconds, 415);
});

test("hard-rejects dialogue, climax, key action and creator exclusions", () => {
  const result = selectSponsorBreakpoints({
    durationSeconds: 2400,
    candidates: [
      { atSeconds: 400, source: "creator_mark", confidence: 1, dialogueActive: true },
      { atSeconds: 800, source: "chapter", confidence: 1, climax: true },
      { atSeconds: 1200, source: "scene_transition", confidence: 1, keyAction: true },
      { atSeconds: 1600, source: "dialogue_gap", confidence: 1, creatorExcluded: true }
    ]
  });
  assert.deepEqual(result, []);
});

test("respects lead/tail safety margins, confidence floor, spacing and maximum cap", () => {
  const result = selectSponsorBreakpoints({
    durationSeconds: 1800,
    minLeadSeconds: 60,
    minTailSeconds: 30,
    minSpacingSeconds: 300,
    maxBreaks: 9,
    minConfidence: 0.75,
    candidates: [
      { atSeconds: 30, source: "creator_mark", confidence: 1 },
      { atSeconds: 400, source: "chapter", confidence: 0.74 },
      { atSeconds: 500, source: "creator_mark", confidence: 1 },
      { atSeconds: 650, source: "dialogue_gap", confidence: 0.95 },
      { atSeconds: 1000, source: "scene_transition", confidence: 0.9 },
      { atSeconds: 1790, source: "chapter", confidence: 1 },
      { atSeconds: 1400, source: "chapter", confidence: 0.9 }
    ]
  });
  assert.deepEqual(result.map(x => x.atSeconds), [500, 1000, 1400]);
  assert.ok(result.length <= 3);
});

test("returns no breaks for invalid duration or no evidence", () => {
  assert.deepEqual(selectSponsorBreakpoints({ durationSeconds: 0, candidates: [] }), []);
  assert.deepEqual(selectSponsorBreakpoints({ durationSeconds: 900, candidates: [] }), []);
});

test("ignores malformed evidence and clamps unsafe configuration values", () => {
  const result = selectSponsorBreakpoints({
    durationSeconds: 1200,
    maxBreaks: Number.NaN,
    minSpacingSeconds: Number.NaN,
    candidates: [
      { atSeconds: 300, source: "toString", confidence: 1 },
      { atSeconds: 400, source: "chapter", confidence: 2 },
      { atSeconds: 500, source: "chapter", confidence: 0.9 },
      { atSeconds: 510, source: "scene_transition", confidence: 0.99 }
    ]
  });
  assert.deepEqual(result.map(x => x.atSeconds), [500]);
});

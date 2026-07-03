import { TRANSFORM_PRESETS } from "@velata/core";
import { describe, expect, it } from "vitest";

import { pickTransforms, TRANSFORM_COUNT } from "./transforms";

describe("pickTransforms", () => {
  it("returns the requested count of distinct presets drawn from the pool", () => {
    for (let run = 0; run < 50; run += 1) {
      const batch = pickTransforms(TRANSFORM_PRESETS, TRANSFORM_COUNT, []);
      expect(batch).toHaveLength(TRANSFORM_COUNT);
      const ids = new Set(batch.map((preset) => preset.id));
      expect(ids.size).toBe(TRANSFORM_COUNT);
      for (const preset of batch) {
        expect(TRANSFORM_PRESETS).toContain(preset);
      }
    }
  });

  it("never repeats the current batch while the pool has enough fresh presets", () => {
    let current = pickTransforms(TRANSFORM_PRESETS, TRANSFORM_COUNT, []);
    for (let run = 0; run < 50; run += 1) {
      const next = pickTransforms(TRANSFORM_PRESETS, TRANSFORM_COUNT, current);
      const currentIds = new Set(current.map((preset) => preset.id));
      for (const preset of next) {
        expect(currentIds.has(preset.id)).toBe(false);
      }
      current = next;
    }
  });

  it("caps the result at the pool size when count exceeds it", () => {
    const small = TRANSFORM_PRESETS.slice(0, 2);
    const batch = pickTransforms(small, TRANSFORM_COUNT, []);
    expect(batch).toHaveLength(2);
  });
});

import { type Instruction } from "@velata/core";

/** How many transform chips the bar shows at once. */
export const TRANSFORM_COUNT = 3;

function shuffle<T>(items: readonly T[]): T[] {
  return [...items]
    .map((value) => ({ value, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ value }) => value);
}

/**
 * Draws `count` presets from `pool`, preferring ones absent from `current` so a
 * "new batch" feels fresh. When the pool has enough unused presets, the result
 * shares nothing with `current`; otherwise it falls back to repeating some.
 */
export function pickTransforms(
  pool: readonly Instruction[],
  count: number,
  current: readonly Instruction[],
): readonly Instruction[] {
  const currentIds = new Set(current.map((preset) => preset.id));
  const fresh = shuffle(pool.filter((preset) => !currentIds.has(preset.id)));
  const reused = shuffle(pool.filter((preset) => currentIds.has(preset.id)));
  return [...fresh, ...reused].slice(0, count);
}

/** A single-range document change: replace `[from, to)` with `insert`. */
export interface ReconcileChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * The minimal single-range edit turning `current` into `next` by trimming the
 * shared prefix and suffix. Returns `null` when the strings are already equal.
 */
export function computeReconcileChange(current: string, next: string): ReconcileChange | null {
  if (current === next) {
    return null;
  }

  const maxPrefix = Math.min(current.length, next.length);
  let prefix = 0;
  while (prefix < maxPrefix && current[prefix] === next[prefix]) {
    prefix += 1;
  }

  const maxSuffix = Math.min(current.length - prefix, next.length - prefix);
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}

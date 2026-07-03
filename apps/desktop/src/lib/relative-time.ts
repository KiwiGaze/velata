const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** Formats how long ago a timestamp was: "just now", "5 minutes ago", "2 days ago". */
export function formatRelativeTime(timestamp: number, now: number): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    return relativeFormat.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  }
  if (elapsed < DAY_MS) {
    return relativeFormat.format(-Math.floor(elapsed / HOUR_MS), "hour");
  }
  return relativeFormat.format(-Math.floor(elapsed / DAY_MS), "day");
}

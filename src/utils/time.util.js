/**
 * Converts a 24h time string (HH:MM or HH:MM:SS) to 12h format (h:MM AM/PM).
 * Returns null if input is null/undefined.
 * The DB always stores TIME as 24h — use this only in API response serialisation.
 */
export function to12h(time) {
  if (!time) return null;
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time; // pass through if unparseable
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

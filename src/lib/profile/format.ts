// A fixed list: Intl's en-GB short month varies by runtime ("Sep" or "Sept"), and server and browser must agree.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** "Sep 2024 to now", "Jun 2023 to Aug 2023", "Until Aug 2023", or null when no dates were given. */
export function formatMonthRange(start: string | null, end: string | null): string | null {
  if (start) return `${monthYear(start)} to ${end ? monthYear(end) : "now"}`;
  return end ? `Until ${monthYear(end)}` : null;
}

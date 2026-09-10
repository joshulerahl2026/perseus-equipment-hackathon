/** Display helpers. Business users read these numbers, so keep them plain. */

/**
 * Pluralizes a trade class so talk tracks read as English.
 *
 * `CustomerClass.Description` is whatever the dealership typed, and the
 * sentences that use it need a plural subject: "Contractors of your size run
 * about...". This covers regular English nouns, which is what trade classes
 * are, and leaves anything already plural alone.
 */
export function pluralize(noun: string): string {
  const word = noun.trim();
  if (!word) return word;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function money(value: number | null | undefined, opts?: { cents?: boolean }): string {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  }).format(value);
}

/** Compact form for KPI headlines, where $1.2M beats $1,238,411. */
export function moneyCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `$${Math.round(value / 1000)}K`;
  return money(value);
}

export function count(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function decimal(value: number | null | undefined, places = 1): string {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toFixed(places);
}

export function percent(value: number | null | undefined, places = 0): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${(value * 100).toFixed(places)}%`;
}

export function hours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return `${decimal(value, 1)} hrs`;
}

export function days(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  const n = Math.round(value);
  return `${count(n)} ${n === 1 ? "day" : "days"}`;
}

/** Dates arrive as TEXT; show the date part in a form a manager reads easily. */
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "--";
  const iso = value.slice(0, 10);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function monthLabel(yearMonth: string): string {
  const d = new Date(`${yearMonth}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return yearMonth;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function monthsAgoLabel(months: number | null | undefined): string {
  if (months == null) return "never";
  if (months === 0) return "this month";
  if (months === 1) return "1 month ago";
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(months / 12)} years ago`;
}

export function formatByKind(
  value: number | string,
  format: "money" | "number" | "hours" | "percent" | "days" | "text",
): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "money":
      return money(value);
    case "hours":
      return hours(value);
    case "percent":
      return percent(value);
    case "days":
      return days(value);
    case "number":
      return Number.isInteger(value) ? count(value) : decimal(value, 1);
    default:
      return String(value);
  }
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

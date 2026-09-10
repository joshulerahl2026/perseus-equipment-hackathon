/**
 * Shared SQL fragments and date helpers.
 *
 * Two rules from the challenge README are enforced here so no query can forget
 * them: revenue counts only posted invoices, and dates are TEXT compared by
 * their `YYYY-MM-DD` prefix rather than parsed.
 */
import { hasTable } from "./schema";

/** Quotes, drafts, voids and commitments are not revenue. */
export const POSTED_STATUSES = ["finalized", "archived"] as const;

export const POSTED = `LOWER(ih.Status) IN ('finalized','archived')`;

const SERVICE_BY_TYPE = `LOWER(ih.InvoiceType) LIKE 'wo%'`;
const RENTAL_BY_TYPE = `(LOWER(ih.InvoiceType) LIKE 'rl%' OR LOWER(ih.InvoiceType) LIKE 'ren%')`;
const PARTS_BY_TYPE = `LOWER(ih.InvoiceType) LIKE 'in%'`;

/**
 * A service invoice is a work order. Prefer the documented `wo` type, but fall
 * back to the presence of a service segment so the definition survives a
 * database that types its work orders differently. The fallback is only
 * emitted when that table exists, otherwise the query it lands in would throw
 * rather than degrade.
 */
export function isServiceInvoice(): string {
  return hasTable("InvoiceSegment")
    ? `(${SERVICE_BY_TYPE} OR EXISTS (SELECT 1 FROM InvoiceSegment sx WHERE sx.InvoiceDocId = ih.InvoiceDocId))`
    : `(${SERVICE_BY_TYPE})`;
}

/**
 * Each document belongs to exactly one revenue line. Service wins, because a
 * work order is a work order however the dealership types it, then rental,
 * then parts. Overlapping definitions would let one invoice land in two lines
 * at once, which double counts it in any total built from the parts.
 */
export function isRentalInvoice(): string {
  return `(${RENTAL_BY_TYPE} AND NOT ${isServiceInvoice()})`;
}

export function isPartsInvoice(): string {
  return `(${PARTS_BY_TYPE} AND NOT ${isServiceInvoice()} AND NOT ${RENTAL_BY_TYPE})`;
}

/** Today, and window boundaries, as `YYYY-MM-DD` strings for TEXT comparison. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthsBefore(months: number, from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function daysBefore(days: number, from = new Date()): string {
  return new Date(from.getTime() - days * 86400000).toISOString().slice(0, 10);
}

/** Trailing twelve months, and the twelve months before that for comparison. */
export function windows() {
  return {
    now: today(),
    t12: monthsBefore(12),
    t24: monthsBefore(24),
    t36: monthsBefore(36),
  };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** `?,?,?` for a parameterized IN list; `NULL` keeps the SQL valid when empty. */
export function placeholders(n: number): string {
  return n > 0 ? new Array(n).fill("?").join(",") : "NULL";
}

export const num = (v: unknown): number => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);

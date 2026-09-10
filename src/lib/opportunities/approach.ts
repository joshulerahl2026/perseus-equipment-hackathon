import { ContactCard, CustomerMetrics } from "../metrics/customers";
import { OfferingId } from "../services/catalog";

/**
 * Per-customer guidance for the rep, built from that customer's own record
 * rather than generic sales advice.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type Approach = {
  angle: string;
  leadWith: string;
  contact: ContactCard | null;
  /** Why the contact record is unusable, when it is. */
  contactGap: string | null;
  callWindow: { monthLabel: string; reason: string } | null;
  channel: string;
};

const ANGLE_BY_OFFERING: Record<OfferingId, string> = {
  maintenance_plan: "Predictable cost",
  annual_inspection: "Risk check",
  onsite_training: "Cost avoidance",
  extended_coverage: "Downside protection",
  parts_stocking: "Uptime",
  rental_to_own: "Equity instead of rent",
};

/**
 * The month before their historical peak, so a landscaper hears about a
 * maintenance plan in late winter rather than mid-season.
 */
function callWindow(m: CustomerMetrics): Approach["callWindow"] {
  if (!m.peakMonths.length) return null;
  const peak = m.peakMonths[0];
  const target = ((peak - 2 + 12) % 12) + 1;
  return {
    monthLabel: MONTHS[target - 1],
    reason: `Their service spend peaks in ${MONTHS[peak - 1]}, so the conversation lands before the machines are needed.`,
  };
}

export function approachFor(m: CustomerMetrics, offeringId: OfferingId, leadWith: string): Approach {
  const contact = m.contact;
  const { contacts, withPhone, withEmail } = m.contactCompleteness;

  let contactGap: string | null = null;
  if (contacts === 0) contactGap = "No contact records on file for this account.";
  else if (withPhone === 0 && withEmail === 0) contactGap = `${contacts} contact${contacts === 1 ? "" : "s"} on file, none with a phone or email.`;
  else if (withPhone === 0) contactGap = "No phone number on file; email only.";

  const channel = contact?.phone ? "Call" : contact?.email ? "Email" : "Look up through the shop or last work order";

  return {
    angle: ANGLE_BY_OFFERING[offeringId],
    leadWith,
    contact,
    contactGap,
    callWindow: callWindow(m),
    channel,
  };
}

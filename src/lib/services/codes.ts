import { cached } from "../db";
import { can } from "../schema";

/**
 * The database has no table of offerings, so "did this customer buy a *new*
 * service" is answered from service codes. Codes differ between dealerships,
 * so rather than hardcoding a list we classify whatever codes the file
 * actually contains and expose the result for the UI to show its work.
 */
const PROACTIVE_PATTERN =
  /(^|[^a-z])(pm|pms|maint|maintenance|plan|insp|inspect|inspection|prevent|preventive|preventative|schedul|interval|service\s?agreement|contract|train|training|coverage|warr)/i;

export type CodeClassification = {
  proactive: string[];
  reactive: string[];
  /** How the split was decided, shown in the "how we calculated this" panels. */
  pattern: string;
};

export function serviceCodeClassification(): CodeClassification {
  return cached("services:codes", ({ db }) => {
    if (!can("serviceSegments")) {
      return { proactive: [], reactive: [], pattern: PROACTIVE_PATTERN.source };
    }
    const rows = db
      .prepare(`SELECT DISTINCT ServiceCode c FROM InvoiceSegment WHERE ServiceCode IS NOT NULL AND TRIM(ServiceCode) <> ''`)
      .all() as { c: string }[];

    const proactive: string[] = [];
    const reactive: string[] = [];
    for (const { c } of rows) {
      (PROACTIVE_PATTERN.test(c) ? proactive : reactive).push(c);
    }
    proactive.sort();
    reactive.sort();
    return { proactive, reactive, pattern: PROACTIVE_PATTERN.source };
  });
}

/** True when the dataset lets us distinguish planned work from reactive repair. */
export function canSplitProactive(): boolean {
  const { proactive } = serviceCodeClassification();
  return proactive.length > 0;
}

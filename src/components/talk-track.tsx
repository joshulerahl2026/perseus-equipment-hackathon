"use client";

import { useState } from "react";
import { Check, Copy, Quote } from "lucide-react";

/**
 * The script the rep reads. Every sentence is generated from rows in the
 * database, so there is nothing here a customer can catch out.
 */
export function TalkTrack({ lines, customerName }: { lines: string[]; customerName: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${customerName}\n\n${lines.join("\n\n")}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border bg-secondary/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Quote className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">What to say</h3>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-secondary"
        >
          {copied ? <Check className="size-3.5 text-[color:var(--positive)]" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-relaxed">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        Every number above comes from this customer&rsquo;s own invoices or from comparable customers in the database.
      </p>
    </div>
  );
}

import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border bg-card p-8">
      <FileQuestion className="mb-3 size-6 text-muted-foreground" />
      <h1 className="text-xl font-semibold tracking-tight">That record is not in the database</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The customer, invoice or machine you asked for does not exist in the file the app is reading. It may
        belong to a different export.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/opportunities" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90">
          Back to the call list
        </Link>
        <Link href="/customers" className="rounded-md border px-3 py-2 hover:bg-secondary">
          Search customers
        </Link>
      </div>
    </div>
  );
}

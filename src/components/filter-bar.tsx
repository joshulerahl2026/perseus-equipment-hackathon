"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectFilter = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

/**
 * URL-driven filters. State lives in the query string so every filtered view
 * is a link a rep can bookmark or send to a colleague.
 */
export function FilterBar({
  filters,
  search,
  searchPlaceholder = "Search",
  resetHref,
}: {
  filters: SelectFilter[];
  search?: { name: string; value: string };
  searchPlaceholder?: string;
  resetHref?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    next.delete("page");
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-3", pending && "opacity-70")}>
      {search && (
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get(search.name);
            update(search.name, typeof value === "string" ? value : "");
          }}
        >
          <label htmlFor="filter-search" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Search className="pointer-events-none absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
          <input
            id="filter-search"
            name={search.name}
            defaultValue={search.value}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </form>
      )}

      {filters.map((filter) => (
        <div key={filter.name} className="flex flex-col">
          <label htmlFor={`filter-${filter.name}`} className="mb-1 text-xs font-medium text-muted-foreground">
            {filter.label}
          </label>
          <select
            id={`filter-${filter.name}`}
            value={filter.value}
            onChange={(e) => update(filter.name, e.target.value)}
            className="h-9 rounded-md border bg-background px-2.5 pr-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {resetHref && params.size > 0 && (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(resetHref, { scroll: false }))}
          className="h-9 rounded-md border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}

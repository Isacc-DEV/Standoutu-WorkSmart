'use client';

import type { Country, DateRangeKey } from "../types";

type JobLinksFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  countries: Country[];
  selectedCountryId: string;
  onCountryChange: (value: string) => void;
  range: DateRangeKey;
  onRangeChange: (value: DateRangeKey) => void;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  onReset: () => void;
  onRefresh: () => void;
  loading: boolean;
};

const rangeOptions: Array<{ value: DateRangeKey; label: string }> = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
];

const pageSizeOptions = [25, 50, 100];

export default function JobLinksFilters({
  search,
  onSearchChange,
  countries,
  selectedCountryId,
  onCountryChange,
  range,
  onRangeChange,
  pageSize,
  onPageSizeChange,
  onReset,
  onRefresh,
  loading
}: JobLinksFiltersProps) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_0.7fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Search
          </span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by URL or domain"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
          />
        </label>

        <label className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Country
          </span>
          <select
            value={selectedCountryId}
            onChange={(event) => onCountryChange(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
          >
            <option value="all">All countries</option>
            {countries.map((country) => (
              <option key={country.id} value={String(country.id)}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Date range
          </span>
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value as DateRangeKey)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Page size
          </span>
          <select
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={String(option)}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>
    </section>
  );
}

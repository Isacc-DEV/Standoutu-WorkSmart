'use client';

export default function JobLinksEmptyState() {
  return (
    <section className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center shadow-[0_18px_60px_-50px_rgba(15,23,42,0.25)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">
        No job links yet
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        Try adjusting the search, country, or date filters to see more results.
      </p>
    </section>
  );
}

'use client';

import type { JobLink } from "../types";
import { formatDateTime, formatRelativeTime, safeDomain } from "../utils";

type JobLinksListProps = {
  items: JobLink[];
  loading: boolean;
};

export default function JobLinksList({ items, loading }: JobLinksListProps) {
  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          Loading job links...
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        No job links match this filter. Try adjusting the search or range.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {items.map((item) => {
        const domain = safeDomain(item.url);
        const submittedLabel = formatRelativeTime(item.submittedAt);
        const submittedFull = formatDateTime(item.submittedAt);
        return (
          <article
            key={item.id}
            className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_70px_-45px_rgba(15,23,42,0.45)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">{domain}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Added {submittedLabel} • {submittedFull}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {item.countryName ?? "Global"}
                </span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
                >
                  Open link
                </a>
              </div>
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate text-sm text-slate-700 underline decoration-slate-200 hover:text-slate-900"
              title={item.url}
            >
              {item.url}
            </a>
          </article>
        );
      })}
    </section>
  );
}

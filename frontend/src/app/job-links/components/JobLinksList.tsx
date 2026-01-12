'use client';

import { useEffect, useState } from "react";
import type { JobLink } from "../types";
import { formatRelativeTime } from "../utils";
import JobLinksEmptyState from "./JobLinksEmptyState";

type JobLinksListProps = {
  items: JobLink[];
  loading: boolean;
  startIndex: number;
  onOpenLink?: (url: string) => void;
};

const STORAGE_KEY = "smartwork_job_links_clicked";

const readClickedLinks = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item) => typeof item === "string"));
  } catch {
    return new Set();
  }
};

const writeClickedLinks = (links: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(links)));
  } catch {
    // Ignore storage failures.
  }
};

export default function JobLinksList({
  items,
  loading,
  startIndex,
  onOpenLink
}: JobLinksListProps) {
  const [clickedLinks, setClickedLinks] = useState<Set<string>>(() => readClickedLinks());

  useEffect(() => {
    setClickedLinks(readClickedLinks());
  }, []);

  const handleLinkClick = (url: string) => {
    setClickedLinks((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      writeClickedLinks(next);
      return next;
    });
  };

  const handleOpen = (event: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    handleLinkClick(url);
    if (onOpenLink) {
      event.preventDefault();
      onOpenLink(url);
    }
  };

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
    return <JobLinksEmptyState />;
  }

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left">No</th>
              <th className="px-5 py-3 text-left">Job link</th>
              <th className="px-5 py-3 text-left">Country</th>
              <th className="px-5 py-3 text-left">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, index) => {
              const submittedLabel = formatRelativeTime(item.submittedAt);
              const isClicked = clickedLinks.has(item.url);
              const linkClass = isClicked
                ? "text-rose-600 hover:text-rose-700"
                : "text-emerald-600 hover:text-emerald-700";
              const rowNumber = startIndex + index + 1;

              return (
                <tr key={item.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-xs font-semibold text-slate-400">
                    {rowNumber}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={item.url}
                      onClick={(event) => handleOpen(event, item.url)}
                      className={`block max-w-[520px] truncate text-base font-semibold ${linkClass}`}
                      title={item.url}
                    >
                      {item.url}
                    </a>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {item.countryName ?? "Global"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {submittedLabel}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

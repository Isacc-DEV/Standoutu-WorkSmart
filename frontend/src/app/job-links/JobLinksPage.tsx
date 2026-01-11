'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../lib/useAuth";
import { fetchCountries, fetchJobLinks } from "./api";
import JobLinksFilters from "./components/JobLinksFilters";
import JobLinksList from "./components/JobLinksList";
import type { Country, DateRangeKey, JobLink } from "./types";
import { buildSinceIso, useDebouncedValue } from "./utils";

const DEFAULT_RANGE: DateRangeKey = "7d";
const DEFAULT_LIMIT = 50;

export default function JobLinksPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [links, setLinks] = useState<JobLink[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedCountryId, setSelectedCountryId] = useState("all");
  const [range, setRange] = useState<DateRangeKey>(DEFAULT_RANGE);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState("");
  const [countriesError, setCountriesError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const since = useMemo(() => buildSinceIso(range), [range]);
  const parsedCountryId = useMemo(() => {
    if (selectedCountryId === "all") return undefined;
    const parsed = Number(selectedCountryId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [selectedCountryId]);

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace("/auth");
    }
  }, [loading, user, token, router]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const loadCountries = async () => {
      try {
        const result = await fetchCountries(token);
        if (!active) return;
        setCountries(result);
        setCountriesError("");
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Unable to load countries.";
        setCountriesError(message);
      }
    };
    void loadCountries();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, selectedCountryId, range, limit]);

  const loadLinks = useCallback(async () => {
    if (!token) return;
    setLoadingLinks(true);
    setError("");
    try {
      const response = await fetchJobLinks(
        {
          limit,
          offset,
          search: debouncedSearch || undefined,
          countryId: parsedCountryId,
          since
        },
        token
      );
      setLinks(Array.isArray(response.items) ? response.items : []);
      setTotal(typeof response.total === "number" ? response.total : 0);
      setLastUpdatedAt(new Date());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load job links.";
      setError(message);
      setLinks([]);
      setTotal(0);
    } finally {
      setLoadingLinks(false);
    }
  }, [token, limit, offset, debouncedSearch, parsedCountryId, since]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const handleReset = () => {
    setSearch("");
    setSelectedCountryId("all");
    setRange(DEFAULT_RANGE);
    setLimit(DEFAULT_LIMIT);
    setOffset(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = total === 0 ? 1 : Math.floor(offset / limit) + 1;
  const showingStart = total === 0 ? 0 : offset + 1;
  const showingEnd = Math.min(offset + links.length, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-white text-slate-900">
      <TopNav />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Job links
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">
            Fresh jobs from the scraper feed
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Browse new job links and jump straight to the source page. Use filters
            to narrow by country, time range, or keyword.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Total links
            </div>
            <div className="text-2xl font-semibold text-slate-900">{total}</div>
            <div className="text-xs text-slate-500">
              Showing {showingStart}-{showingEnd}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Page
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {currentPage} / {totalPages}
            </div>
            <div className="text-xs text-slate-500">Limit {limit} per page</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Last updated
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "—"}
            </div>
            <div className="text-xs text-slate-500">
              {lastUpdatedAt ? lastUpdatedAt.toLocaleDateString() : "Not loaded yet"}
            </div>
          </div>
        </section>

        {countriesError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {countriesError}
          </div>
        ) : null}

        <JobLinksFilters
          search={search}
          onSearchChange={setSearch}
          countries={countries}
          selectedCountryId={selectedCountryId}
          onCountryChange={setSelectedCountryId}
          range={range}
          onRangeChange={setRange}
          pageSize={limit}
          onPageSizeChange={setLimit}
          onReset={handleReset}
          onRefresh={loadLinks}
          loading={loadingLinks}
        />

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <JobLinksList items={links} loading={loadingLinks} />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/70 bg-white px-5 py-4 text-sm text-slate-600 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
          <div>
            Showing {showingStart}-{showingEnd} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={!canPrev}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + limit)}
              disabled={!canNext}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

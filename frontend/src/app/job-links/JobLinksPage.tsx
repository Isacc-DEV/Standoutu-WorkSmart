'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../lib/useAuth";
import { fetchCountries, fetchJobLinks } from "./api";
import JobLinksFilters from "./components/JobLinksFilters";
import JobLinksList from "./components/JobLinksList";
import JobLinksErrorState from "./components/JobLinksErrorState";
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
    if (!token || user?.role === "OBSERVER") return;
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
  }, [token, user?.role]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, selectedCountryId, range, limit]);

  const loadLinks = useCallback(async () => {
    if (!token || user?.role === "OBSERVER") return;
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
  }, [token, user?.role, limit, offset, debouncedSearch, parsedCountryId, since]);

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

  const handleOpenLink = useCallback(
    (url: string) => {
      router.push(`/workspace?jobUrl=${encodeURIComponent(url)}`);
    },
    [router]
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = total === 0 ? 1 : Math.floor(offset / limit) + 1;
  const showingStart = total === 0 ? 0 : offset + 1;
  const showingEnd = Math.min(offset + links.length, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-white text-slate-900">
        <TopNav />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16 text-center text-sm text-slate-600">
          Loading job links...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-white text-slate-900">
        <TopNav />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16 text-center text-sm text-slate-600">
          Redirecting to login...
        </div>
      </main>
    );
  }

  if (user.role === "OBSERVER") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-white text-slate-900">
        <TopNav />
        <div className="mx-auto w-full max-w-2xl px-4 py-20">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
            <div className="mb-6">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <svg
                  className="h-10 w-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h1 className="mb-2 text-3xl font-bold text-slate-900">
                Access Restricted
              </h1>
              <p className="text-slate-600">
                You do not have permission to access job links.
              </p>
            </div>

            <div className="mb-6 rounded-2xl bg-slate-50 p-6 text-left">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Why can't I access this page?
              </h2>
              <p className="mb-4 text-sm text-slate-600">
                Your current role (
                <span className="font-semibold text-slate-900">
                  {user.role}
                </span>
                ) has view-only permissions. Job link access requires an active
                bidder or manager role.
              </p>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                How to get access
              </h2>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-600">{">"}</span>
                  <span>Contact your administrator to upgrade your role</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-600">{">"}</span>
                  <span>Request access through your manager</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-blue-600">{">"}</span>
                  <span>Email support with your access request</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => router.push("/workspace")}
                className="rounded-2xl border border-slate-200 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Go to Workspace
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
              {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "-"}
            </div>
            <div className="text-xs text-slate-500">
              {lastUpdatedAt ? lastUpdatedAt.toLocaleDateString() : "Not loaded yet"}
            </div>
          </div>
        </section>

        {countriesError ? <JobLinksErrorState message={countriesError} /> : null}

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

        {error ? <JobLinksErrorState message={error} /> : null}

        <JobLinksList
          items={links}
          loading={loadingLinks}
          startIndex={offset}
          onOpenLink={handleOpenLink}
        />

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

import { api } from "../../lib/api";
import type { Country, JobLinksResponse } from "./types";

export type JobLinksQuery = {
  limit: number;
  offset: number;
  search?: string;
  countryId?: number;
  since?: string;
  until?: string;
};

export const fetchJobLinks = async (
  query: JobLinksQuery,
  token: string
): Promise<JobLinksResponse> => {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  if (query.search) params.set("search", query.search);
  if (query.countryId) params.set("countryId", String(query.countryId));
  if (query.since) params.set("since", query.since);
  if (query.until) params.set("until", query.until);

  const path = `/scraper/job-links?${params.toString()}`;
  return api<JobLinksResponse>(path, undefined, token);
};

export const fetchCountries = async (token: string): Promise<Country[]> => {
  const data = await api<{ countries?: Country[] }>(
    "/scraper/countries",
    undefined,
    token
  );
  return Array.isArray(data.countries) ? data.countries : [];
};

export type JobLink = {
  id: number;
  url: string;
  countryId: number | null;
  countryName: string | null;
  submittedAt: string;
};

export type Country = {
  id: number;
  name: string;
};

export type JobLinksResponse = {
  items: JobLink[];
  total: number;
  limit: number;
  offset: number;
};

export type DateRangeKey = "all" | "24h" | "7d" | "30d";

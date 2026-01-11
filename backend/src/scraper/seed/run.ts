import fs from "node:fs";
import path from "node:path";
import { createScrapePool, ensureScrapeSchema, resolveTableNames } from "../db.js";

type SeedData = {
  countries: Array<{ name: string }>;
  sources: Array<{ name: string }>;
  sourceUrls: Array<{ url: string; source: string; country: string }>;
};

const log = (message: string, meta?: Record<string, unknown>): void => {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
};

const dataPath = (): string => {
  return path.resolve(__dirname, "data.json");
};

const loadSeedData = (): SeedData => {
  const payload = fs.readFileSync(dataPath(), "utf-8");
  return JSON.parse(payload) as SeedData;
};

const getOrCreateByName = async (
  pool: ReturnType<typeof createScrapePool>,
  table: string,
  name: string
): Promise<{ id: number; created: boolean }> => {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM ${table} WHERE name = $1 LIMIT 1`,
    [name]
  );
  if (existing.rowCount && existing.rows[0]) {
    return { id: existing.rows[0].id, created: false };
  }

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO ${table} (name) VALUES ($1) RETURNING id`,
    [name]
  );
  return { id: inserted.rows[0].id, created: true };
};

const seed = async (): Promise<void> => {
  const pool = createScrapePool();
  try {
    const schemaResult = await ensureScrapeSchema({ pool });
    if (schemaResult.createdTables.length > 0) {
      log("Database schema created", { tables: schemaResult.createdTables });
    }

    const data = loadSeedData();
    const tableNames = resolveTableNames();

    const countryIds = new Map<string, number>();
    let countriesInserted = 0;
    for (const country of data.countries) {
      const result = await getOrCreateByName(
        pool,
        tableNames.countries,
        country.name
      );
      if (result.created) {
        countriesInserted += 1;
      }
      countryIds.set(country.name, result.id);
    }

    const sourceIds = new Map<string, number>();
    let sourcesInserted = 0;
    for (const source of data.sources) {
      const result = await getOrCreateByName(
        pool,
        tableNames.sources,
        source.name
      );
      if (result.created) {
        sourcesInserted += 1;
      }
      sourceIds.set(source.name, result.id);
    }

    let inserted = 0;
    for (const sourceUrl of data.sourceUrls) {
      const sourceId = sourceIds.get(sourceUrl.source);
      const countryId = countryIds.get(sourceUrl.country);
      if (!sourceId || !countryId) {
        continue;
      }
      const result = await pool.query(
        `INSERT INTO ${tableNames.sourceUrls} (url, source_id, country_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (url) DO NOTHING`,
        [sourceUrl.url, sourceId, countryId]
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted += 1;
      }
    }

    log("Seed complete", {
      countries: countryIds.size,
      countriesInserted,
      countriesSkipped: data.countries.length - countriesInserted,
      sources: sourceIds.size,
      sourcesInserted,
      sourcesSkipped: data.sources.length - sourcesInserted,
      sourceUrlsInserted: inserted,
      sourceUrlsSkipped: data.sourceUrls.length - inserted,
      sourceUrlsTotal: data.sourceUrls.length
    });
  } finally {
    await pool.end();
  }
};

seed().catch((error) => {
  log("Seed failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});

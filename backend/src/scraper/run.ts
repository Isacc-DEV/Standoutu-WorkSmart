import cron from "node-cron";
import { scrapeUrls } from "./scrape.js";
import { ensureScrapeSchema, createScrapePool } from "./db.js";
import { createPostgresScrapeStore } from "./postgres.js";

const log = (message: string, meta?: Record<string, unknown>): void => {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
};

const oneHourMs = 60 * 60 * 1000;
const cronExpression = "*/1 * * * *";

let isRunning = false;
let lastCompletedAt: Date | null = null;

const runOnce = async (): Promise<void> => {
  const pool = createScrapePool();
  const store = createPostgresScrapeStore({ pool });
  try {
    const schemaResult = await ensureScrapeSchema({ pool });
    if (schemaResult.createdTables.length > 0) {
      log("Database schema created", {
        tables: schemaResult.createdTables
      });
    } else {
      log("Database schema already exists");
    }
    const summary = await scrapeUrls(store);
    log("Scrape complete", summary);
  } finally {
    await store.close();
    await pool.end();
  }
};

const runWithCooldown = async (): Promise<void> => {
  if (isRunning) {
    return;
  }

  const now = Date.now();
  if (lastCompletedAt && now - lastCompletedAt.getTime() < oneHourMs) {
    return;
  }

  isRunning = true;
  try {
    await runOnce();
  } catch (error) {
    log("Scrape failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    lastCompletedAt = new Date();
    isRunning = false;
    log("Next scrape eligible", {
      at: new Date(lastCompletedAt.getTime() + oneHourMs).toISOString()
    });
  }
};

const startCron = (): void => {
  cron.schedule(cronExpression, () => {
    void runWithCooldown();
  });
  log("Cron schedule started", { cronExpression });
};

const start = async (): Promise<void> => {
  await runWithCooldown();
  startCron();
};

start().catch((error) => {
  console.error("Scrape scheduler failed:", error);
  process.exit(1);
});

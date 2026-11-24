import { migrate } from "../scripts/migrate.js";
import { pool, BUILD_ID, DATABASE_URL, migrationLevel } from "../src/db.js";
import { chromium } from "@playwright/test";

// Migrate and print build, migration and browser version
export default async function globalSetup() {
  await migrate();
  const level = await migrationLevel();
  await pool.end();
  const browser = await chromium.launch();
  const version = browser.version();
  await browser.close();
  const dbName = new URL(DATABASE_URL).pathname.slice(1);
  console.log(`[env] build=${BUILD_ID} database=${dbName} migration=${level} browser=chromium ${version}`);
}

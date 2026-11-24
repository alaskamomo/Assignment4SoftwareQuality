import { migrate } from "../scripts/migrate.js";
import { pool, BUILD_ID, DATABASE_URL, migrationLevel } from "../src/db.js";

// Migrate and print build and migration level
export default async function setup() {
  await migrate();
  const level = await migrationLevel();
  const dbName = new URL(DATABASE_URL).pathname.slice(1);
  console.log(`[env] build=${BUILD_ID} database=${dbName} migration=${level} node=${process.version}`);
  await pool.end();
}

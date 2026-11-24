import pg from "pg";

// Set DATABASE_URL to point at the test database
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/enrollmentnow_test";

export const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Build ID for the test output
export const BUILD_ID = process.env.BUILD_ID ?? "enrollmentnow-1.0.0-local";

// Latest migration that ran
export async function migrationLevel() {
  const { rows } = await pool.query(
    "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1"
  );
  return rows[0]?.name ?? "none";
}

// Part 5 bugs. SEED_DEFECT=seat-label,skip-prereq,... or "all". Unset = no bugs.
export function seeded(name) {
  const list = (process.env.SEED_DEFECT ?? "").split(",").map((s) => s.trim());
  return list.includes("all") || list.includes(name);
}

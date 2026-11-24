import pg from "pg";

// Connection string comes from the environment so tests and dev never share a database
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/enrollmentnow_test";

export const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Build identifier shown in test output and the defect report
export const BUILD_ID = process.env.BUILD_ID ?? "enrollmentnow-1.0.0-local";

// Latest applied migration, e.g. "002_audit_log"
export async function migrationLevel() {
  const { rows } = await pool.query(
    "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1"
  );
  return rows[0]?.name ?? "none";
}

// Seeded defects for Part 5. SEED_DEFECT can list several, e.g. "seat-label,skip-prereq",
// or "all" for all four: seat-label, skip-prereq, skip-duplicate, wrong-seat-column.
// With SEED_DEFECT unset the app behaves correctly and every test passes.
export function seeded(name) {
  const list = (process.env.SEED_DEFECT ?? "").split(",").map((s) => s.trim());
  return list.includes("all") || list.includes(name);
}

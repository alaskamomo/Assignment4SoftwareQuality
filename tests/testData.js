import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import { pool, DATABASE_URL } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

export const TEST_PASSWORD = "test-password";

// Only run against a database ending in _test
const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against "${dbName}". Use a database ending in _test.`);
}

export const db = pool;

// Track what each test makes so it can be cleaned up
const created = { studentIds: [], courseCodes: [] };

export function uniqueCode(prefix = "MCS") {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createStudent({ name = "Test Student", completed = [] } = {}) {
  const { rows } = await db.query(
    "INSERT INTO students (name, password_hash) VALUES ($1, $2) RETURNING id",
    [name, hashPassword(TEST_PASSWORD)]);
  const id = rows[0].id;
  created.studentIds.push(id);
  for (const code of completed) {
    await db.query("INSERT INTO completed_courses VALUES ($1, $2)", [id, code]);
  }
  return id;
}

export async function createCourse({ code = uniqueCode(), title = "Software Testing",
                                     availableSeats = 2, capacity = availableSeats,
                                     prerequisites = [] } = {}) {
  await db.query(
    "INSERT INTO courses (code, title, capacity, available_seats) VALUES ($1, $2, $3, $4)",
    [code, title, capacity, availableSeats]
  );
  created.courseCodes.push(code);
  for (const p of prerequisites) {
    await db.query("INSERT INTO prerequisites VALUES ($1, $2)", [code, p]);
  }
  return code;
}

// Log in and keep the cookie for later requests
export async function loginAs(studentId) {
  const agent = request.agent(app);
  const res = await agent.post("/api/login").send({ studentId, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for student ${studentId}: ${res.status}`);
  return agent;
}

// Registration straight in the DB (for the duplicate test)
export async function createRegistration(studentId, courseCode) {
  await db.query("INSERT INTO registrations (student_id, course_code) VALUES ($1, $2)",
                 [studentId, courseCode]);
  await db.query("UPDATE courses SET available_seats = available_seats - 1 WHERE code = $1",
                 [courseCode]);
}

// Delete what the test made (the rest cascades)
export async function cleanupTestData() {
  const { studentIds, courseCodes } = created;
  await db.query("DELETE FROM audit_log WHERE student_id = ANY($1) OR course_code = ANY($2)",
                 [studentIds, courseCodes]);
  await db.query("DELETE FROM students WHERE id = ANY($1)", [studentIds]);
  await db.query("DELETE FROM courses WHERE code = ANY($1)", [courseCodes]);
  created.studentIds = [];
  created.courseCodes = [];
}

export async function waitlistCount(studentId, courseCode) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM waitlist WHERE student_id = $1 AND course_code = $2",
    [studentId, courseCode]);
  return rows[0].n;
}

// Query helpers
export async function countRegistrations(studentId, courseCode) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM registrations WHERE student_id = $1 AND course_code = $2",
    [studentId, courseCode]);
  return rows[0].n;
}

export async function seatsFor(courseCode) {
  const { rows } = await db.query("SELECT available_seats FROM courses WHERE code = $1", [courseCode]);
  return rows[0]?.available_seats;
}

export async function auditCount() {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM audit_log");
  return rows[0].n;
}

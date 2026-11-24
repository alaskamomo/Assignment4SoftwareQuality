import { pool } from "./db.js";
import { RegistrationError } from "./registrationService.js";

// Waitlist for full courses. Doesn't take a seat.
export async function joinWaitlist(studentId, courseCode) {
  if (!Number.isInteger(studentId) || typeof courseCode !== "string" || courseCode.trim() === "") {
    throw new RegistrationError(400, "INVALID_REQUEST", "studentId (integer) and courseCode are required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const course = await client.query(
      "SELECT code, available_seats FROM courses WHERE code = $1 FOR UPDATE", [courseCode]);
    if (course.rowCount === 0) {
      throw new RegistrationError(404, "COURSE_NOT_FOUND", `Course ${courseCode} was not found`);
    }

    const registered = await client.query(
      "SELECT id FROM registrations WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]);
    if (registered.rowCount > 0) {
      throw new RegistrationError(409, "ALREADY_REGISTERED", "Student is already registered for this course");
    }

    const waiting = await client.query(
      "SELECT id FROM waitlist WHERE student_id = $1 AND course_code = $2", [studentId, courseCode]);
    if (waiting.rowCount > 0) {
      throw new RegistrationError(409, "ALREADY_ON_WAITLIST", "Student is already on the waitlist for this course");
    }

    // open seats means they should just register
    if (course.rows[0].available_seats > 0) {
      throw new RegistrationError(409, "COURSE_NOT_FULL", "Course has open seats, so register instead");
    }

    // still need the prereqs
    const missing = await client.query(
      `SELECT p.prerequisite_code FROM prerequisites p
       WHERE p.course_code = $1
         AND p.prerequisite_code NOT IN
             (SELECT course_code FROM completed_courses WHERE student_id = $2)
       ORDER BY p.prerequisite_code`,
      [courseCode, studentId]);
    if (missing.rowCount > 0) {
      const codes = missing.rows.map((r) => r.prerequisite_code);
      throw new RegistrationError(422, "MISSING_PREREQUISITE",
        `Missing prerequisite: ${codes.join(", ")}`, { missingPrerequisites: codes });
    }

    const entry = await client.query(
      "INSERT INTO waitlist (student_id, course_code) VALUES ($1, $2) RETURNING id",
      [studentId, courseCode]);
    // their spot in line
    const position = await client.query(
      "SELECT count(*)::int AS n FROM waitlist WHERE course_code = $1 AND id <= $2",
      [courseCode, entry.rows[0].id]);
    await client.query(
      "INSERT INTO audit_log (student_id, course_code, action) VALUES ($1, $2, 'WAITLISTED')",
      [studentId, courseCode]);

    await client.query("COMMIT");
    return { waitlistId: entry.rows[0].id, studentId, courseCode, status: "waitlisted",
             position: position.rows[0].n };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

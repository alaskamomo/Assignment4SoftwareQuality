import { pool, seeded } from "./db.js";

// Error with the HTTP status to send back
export class RegistrationError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// One transaction, course row locked so two people can't grab the last seat
export async function registerStudent(studentId, courseCode) {
  if (!Number.isInteger(studentId) || typeof courseCode !== "string" || courseCode.trim() === "") {
    throw new RegistrationError(400, "INVALID_REQUEST", "studentId (integer) and courseCode are required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const course = await client.query(
      "SELECT code, capacity, available_seats FROM courses WHERE code = $1 FOR UPDATE",
      [courseCode]
    );
    if (course.rowCount === 0) {
      throw new RegistrationError(404, "COURSE_NOT_FOUND", `Course ${courseCode} was not found`);
    }

    const student = await client.query("SELECT id FROM students WHERE id = $1", [studentId]);
    if (student.rowCount === 0) {
      throw new RegistrationError(404, "STUDENT_NOT_FOUND", `Student ${studentId} was not found`);
    }

    const existing = await client.query(
      "SELECT id FROM registrations WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]
    );
    // SEEDED DEFECT 3 (skip-duplicate): skips this check, DB throws a 500
    if (existing.rowCount > 0 && !seeded("skip-duplicate")) {
      throw new RegistrationError(409, "ALREADY_REGISTERED", "Student is already registered for this course");
    }

    // prereqs the student is missing
    const missing = await client.query(
      `SELECT p.prerequisite_code FROM prerequisites p
       WHERE p.course_code = $1
         AND p.prerequisite_code NOT IN
             (SELECT course_code FROM completed_courses WHERE student_id = $2)
       ORDER BY p.prerequisite_code`,
      [courseCode, studentId]
    );
    // SEEDED DEFECT 2 (skip-prereq): ignores missing prereqs
    if (missing.rowCount > 0 && !seeded("skip-prereq")) {
      const codes = missing.rows.map((r) => r.prerequisite_code);
      throw new RegistrationError(422, "MISSING_PREREQUISITE",
        `Missing prerequisite: ${codes.join(", ")}`, { missingPrerequisites: codes });
    }

    // SEEDED DEFECT 4 (wrong-seat-column): checks capacity instead of seats left
    const seatsLeft = seeded("wrong-seat-column")
      ? course.rows[0].capacity
      : course.rows[0].available_seats;
    if (seatsLeft <= 0) {
      throw new RegistrationError(409, "COURSE_FULL", "Course is full", { canJoinWaitlist: true });
    }

    const reg = await client.query(
      "INSERT INTO registrations (student_id, course_code) VALUES ($1, $2) RETURNING id",
      [studentId, courseCode]
    );
    const updated = await client.query(
      "UPDATE courses SET available_seats = available_seats - 1 WHERE code = $1 RETURNING available_seats",
      [courseCode]
    );
    await client.query(
      "INSERT INTO audit_log (student_id, course_code, action) VALUES ($1, $2, 'REGISTERED')",
      [studentId, courseCode]
    );

    await client.query("COMMIT");
    return {
      registrationId: reg.rows[0].id,
      studentId,
      courseCode,
      status: "registered",
      availableSeats: updated.rows[0].available_seats,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

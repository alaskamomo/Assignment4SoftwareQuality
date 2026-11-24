import { pool, seeded } from "./db.js";

// Error type that carries the HTTP status the route should return
export class RegistrationError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Registers a student for a course. All checks and writes run in one transaction,
// and the course row is locked so two requests cannot take the same last seat.
export async function registerStudent(studentId, courseCode) {
  if (!Number.isInteger(studentId) || typeof courseCode !== "string" || courseCode.trim() === "") {
    throw new RegistrationError(400, "INVALID_REQUEST", "courseCode is required");
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
    // SEEDED DEFECT 3 (skip-duplicate): the duplicate check is skipped, so the insert
    // hits the database UNIQUE constraint and the student gets a 500 error instead of 409
    if (existing.rowCount > 0 && !seeded("skip-duplicate")) {
      throw new RegistrationError(409, "ALREADY_REGISTERED", "Student is already registered for this course");
    }

    // Prerequisites the student has not completed yet
    const missing = await client.query(
      `SELECT p.prerequisite_code FROM prerequisites p
       WHERE p.course_code = $1
         AND p.prerequisite_code NOT IN
             (SELECT course_code FROM completed_courses WHERE student_id = $2)
       ORDER BY p.prerequisite_code`,
      [courseCode, studentId]
    );
    // SEEDED DEFECT 2 (skip-prereq): the prerequisite result is ignored, so an
    // ineligible student is registered and takes a seat
    if (missing.rowCount > 0 && !seeded("skip-prereq")) {
      const codes = missing.rows.map((r) => r.prerequisite_code);
      throw new RegistrationError(422, "MISSING_PREREQUISITE",
        `Missing prerequisite: ${codes.join(", ")}`, { missingPrerequisites: codes });
    }

    // SEEDED DEFECT 4 (wrong-seat-column): checks total capacity instead of available
    // seats, so a full course passes the check and the seat update breaks the
    // available_seats >= 0 constraint, giving a 500 instead of 409 "Course is full"
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

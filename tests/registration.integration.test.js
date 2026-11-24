import request from "supertest";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { app } from "../src/app.js";
import {
  db, createStudent, createCourse, createRegistration, cleanupTestData,
  countRegistrations, seatsFor, auditCount, uniqueCode, loginAs,
} from "./testData.js";

// Each test arranges its own data, so cleanup after each one is enough for isolation
afterEach(cleanupTestData);
afterAll(() => db.end());

describe("POST /api/registrations (success)", () => {
  test("registers an eligible student and decrements the seat count", async () => {
    // Arrange: eligible student (has the prerequisite) and a course with 2 seats
    const studentId = await createStudent({ completed: ["MCS-1514"] });
    const courseCode = await createCourse({ availableSeats: 2, prerequisites: ["MCS-1514"] });
    expect(await seatsFor(courseCode)).toBe(2); // known starting seat count

    // Act: log in, then send a real HTTP request through Express, service, and the test database
    const agent = await loginAs(studentId);
    const response = await agent
      .post("/api/registrations")
      .send({ studentId, courseCode });

    // Assert the response
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      message: "Registration successful",
      studentId,
      courseCode,
      status: "registered",
      availableSeats: 1,
      seatLabel: "1 seat available", // text the student will see
    });
    expect(response.body.registrationId).toEqual(expect.any(Number));

    // Assert the persistent effects, not just what the API claims
    expect(await countRegistrations(studentId, courseCode)).toBe(1);
    expect(await seatsFor(courseCode)).toBe(1);

    const audit = await db.query(
      "SELECT action FROM audit_log WHERE student_id = $1 AND course_code = $2",
      [studentId, courseCode]);
    expect(audit.rows).toEqual([{ action: "REGISTERED" }]);
  });
});

describe("POST /api/registrations (negative cases)", () => {
  test("course full returns 409 and changes nothing", async () => {
    const studentId = await createStudent();
    const courseCode = await createCourse({ capacity: 30, availableSeats: 0 });
    const auditBefore = await auditCount();

    const agent = await loginAs(studentId);
    const response = await agent.post("/api/registrations").send({ studentId, courseCode });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: "COURSE_FULL", message: "Course is full" });
    expect(await countRegistrations(studentId, courseCode)).toBe(0);
    expect(await seatsFor(courseCode)).toBe(0); // available seats unchanged, never negative
    const capacity = await db.query("SELECT capacity FROM courses WHERE code = $1", [courseCode]);
    expect(capacity.rows[0].capacity).toBe(30); // capacity unchanged
    expect(await auditCount()).toBe(auditBefore);
  });

  test("missing prerequisite returns 422 naming the missing course", async () => {
    const studentId = await createStudent({ completed: [] });
    const courseCode = await createCourse({ availableSeats: 2, prerequisites: ["MCS-1514"] });

    const agent = await loginAs(studentId);
    const response = await agent.post("/api/registrations").send({ studentId, courseCode });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("MISSING_PREREQUISITE");
    expect(response.body.missingPrerequisites).toEqual(["MCS-1514"]);
    expect(response.body.message).toContain("MCS-1514");
    expect(await countRegistrations(studentId, courseCode)).toBe(0);
    expect(await seatsFor(courseCode)).toBe(2);
  });

  test("duplicate registration returns 409 and only one registration remains", async () => {
    const studentId = await createStudent();
    const courseCode = await createCourse({ capacity: 3, availableSeats: 3 });
    await createRegistration(studentId, courseCode); // seats now 2

    const agent = await loginAs(studentId);
    const response = await agent.post("/api/registrations").send({ studentId, courseCode });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ALREADY_REGISTERED");
    expect(await countRegistrations(studentId, courseCode)).toBe(1);
    expect(await seatsFor(courseCode)).toBe(2); // second request did not take another seat
  });

  test("unknown course returns 404 without touching seats or audit records", async () => {
    const studentId = await createStudent();
    const otherCourse = await createCourse({ availableSeats: 2 }); // bystander course
    const auditBefore = await auditCount();
    const missingCode = uniqueCode("NOPE");

    const agent = await loginAs(studentId);
    const response = await agent
      .post("/api/registrations")
      .send({ studentId, courseCode: missingCode });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COURSE_NOT_FOUND");
    expect(response.body.message).toContain(missingCode);
    expect(await seatsFor(otherCourse)).toBe(2);
    expect(await auditCount()).toBe(auditBefore);
    const regs = await db.query("SELECT count(*)::int AS n FROM registrations WHERE student_id = $1",
                                [studentId]);
    expect(regs.rows[0].n).toBe(0);
  });

  test("malformed request body returns 400", async () => {
    const studentId = await createStudent();
    const agent = await loginAs(studentId);
    const response = await agent.post("/api/registrations").send({ studentId }); // no courseCode
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_REQUEST");
  });

  test("registering without logging in returns 401 and changes nothing", async () => {
    const studentId = await createStudent();
    const courseCode = await createCourse({ availableSeats: 2 });
    const auditBefore = await auditCount();

    // No login: even a valid studentId in the body must not be trusted
    const response = await request(app).post("/api/registrations").send({ studentId, courseCode });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("NOT_LOGGED_IN");
    expect(await countRegistrations(studentId, courseCode)).toBe(0);
    expect(await seatsFor(courseCode)).toBe(2);
    expect(await auditCount()).toBe(auditBefore);
  });

  test("registering a different student returns 403 and changes nothing", async () => {
    const studentId = await createStudent();
    const otherStudent = await createStudent();
    const courseCode = await createCourse({ availableSeats: 2 });
    const auditBefore = await auditCount();

    // Logged in as one student, but the body names another
    const agent = await loginAs(studentId);
    const response = await agent.post("/api/registrations")
      .send({ studentId: otherStudent, courseCode });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("STUDENT_MISMATCH");
    expect(await countRegistrations(otherStudent, courseCode)).toBe(0);
    expect(await countRegistrations(studentId, courseCode)).toBe(0);
    expect(await seatsFor(courseCode)).toBe(2);
    expect(await auditCount()).toBe(auditBefore);
  });

  test("wrong password is rejected and no session is created", async () => {
    const studentId = await createStudent();
    const response = await request(app).post("/api/login").send({ studentId, password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("INVALID_CREDENTIALS");
    expect(response.headers["set-cookie"]).toBeUndefined();
    const sessions = await db.query("SELECT count(*)::int AS n FROM sessions WHERE student_id = $1",
                                    [studentId]);
    expect(sessions.rows[0].n).toBe(0);
  });
});

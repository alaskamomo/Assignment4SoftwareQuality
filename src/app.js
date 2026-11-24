import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, seeded, BUILD_ID } from "./db.js";
import { registerStudent, RegistrationError } from "./registrationService.js";
import { login, logout, currentStudent, requireLogin } from "./auth.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

export const app = express();
app.use(express.json());

// Server log: when LOG_FILE is set, every request is appended as one line with
// time, build, seeded defects, method, path, logged-in student, request body
// (password masked), status, and error code.
// The tests set LOG_FILE=test-results/server.log so the log is saved as evidence.
const LOG_FILE = process.env.LOG_FILE;
app.use((req, res, next) => {
  if (!LOG_FILE) return next();
  const start = Date.now();
  let resultCode = "";
  const originalJson = res.json.bind(res);
  // Capture the error/success code from the JSON response for the log line
  res.json = (body) => {
    resultCode = body?.error ?? body?.status ?? body?.message ?? "";
    return originalJson(body);
  };
  res.on("finish", () => {
    const line = [
      new Date().toISOString(),
      `build=${BUILD_ID}`,
      `seed=${process.env.SEED_DEFECT || "none"}`,
      `${req.method} ${req.originalUrl}`,
      req.student ? `student=${req.student.id}` : "", // logged-in student, from the session
      // Passwords are masked so they never end up in the saved log
      req.method === "POST"
        ? `body=${JSON.stringify(req.body?.password ? { ...req.body, password: "***" } : req.body)}`
        : "",
      `-> ${res.statusCode}`,
      resultCode ? `result=${resultCode}` : "",
      res.locals.errorDetail ? `detail="${res.locals.errorDetail}"` : "",
      `${Date.now() - start}ms`,
    ].filter(Boolean).join(" ");
    fs.appendFileSync(LOG_FILE, line + "\n");
  });
  next();
});

// Seat label shown to students.
export function seatLabel(n) {
  // SEEDED DEFECT 1 (seat-label): always uses the plural, so 1 seat shows "1 seats available"
  if (seeded("seat-label")) return `${n} seats available`;
  return `${n} ${n === 1 ? "seat" : "seats"} available`;
}

app.get("/api/courses/:code", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT code, title, capacity, available_seats FROM courses WHERE code = $1",
    [req.params.code]
  );
  if (rows.length === 0) return res.status(404).json({ error: "COURSE_NOT_FOUND" });
  const c = rows[0];
  res.json({ code: c.code, title: c.title, capacity: c.capacity,
             availableSeats: c.available_seats, seatLabel: seatLabel(c.available_seats) });
});

// Login: student ID + password. A session cookie identifies the student after that.
app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", async (req, res) => {
  const student = await currentStudent(req);
  if (!student) return res.status(401).json({ error: "NOT_LOGGED_IN", message: "Not logged in" });
  res.json({ studentId: student.id, name: student.name });
});

// The request carries the student ID and course code (Part 2). The student ID
// must match the logged-in student, so one student cannot register someone else.
app.post("/api/registrations", requireLogin, async (req, res) => {
  const { studentId, courseCode } = req.body ?? {};
  if (Number.isInteger(studentId) && studentId !== req.student.id) {
    return res.status(403).json({ error: "STUDENT_MISMATCH",
      message: "You can only register yourself" });
  }
  try {
    const result = await registerStudent(studentId, courseCode);
    res.status(201).json({ message: "Registration successful", ...result,
                           seatLabel: seatLabel(result.availableSeats) });
  } catch (err) {
    if (err instanceof RegistrationError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...err.details });
    }
    console.error(err);
    res.locals.errorDetail = err.message; // database error text goes into server.log
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error" });
  }
});

// Student-facing pages
app.get("/login", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.get("/courses/:code", (_req, res) => res.sendFile(path.join(publicDir, "course.html")));

// Test-only fixture routes. They are never mounted outside NODE_ENV=test.
if (process.env.NODE_ENV === "test") {
  const { testRouter } = await import("./testRoutes.js");
  app.use("/test", testRouter);
}

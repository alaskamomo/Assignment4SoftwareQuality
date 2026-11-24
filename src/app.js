import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, seeded, BUILD_ID } from "./db.js";
import { registerStudent, RegistrationError } from "./registrationService.js";
import { joinWaitlist } from "./waitlistService.js";
import { login, logout, currentStudent, requireLogin } from "./auth.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

export const app = express();
app.use(express.json());

// Writes one line per request to LOG_FILE (tests use test-results/server.log)
const LOG_FILE = process.env.LOG_FILE;
app.use((req, res, next) => {
  if (!LOG_FILE) return next();
  const start = Date.now();
  let resultCode = "";
  const originalJson = res.json.bind(res);
  // grab the result code for the log
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
      req.student ? `student=${req.student.id}` : "",
      // hide passwords
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

// "1 seat" vs "2 seats"
export function seatLabel(n) {
  // SEEDED DEFECT 1 (seat-label): always plural
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

// Login and logout
app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", async (req, res) => {
  const student = await currentStudent(req);
  if (!student) return res.status(401).json({ error: "NOT_LOGGED_IN", message: "Not logged in" });
  res.json({ studentId: student.id, name: student.name });
});

// Student ID has to match whoever is logged in
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
    res.locals.errorDetail = err.message; // shows up in server.log
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error" });
  }
});

// Join the waitlist (same checks as registering)
app.post("/api/waitlist", requireLogin, async (req, res) => {
  const { studentId, courseCode } = req.body ?? {};
  if (Number.isInteger(studentId) && studentId !== req.student.id) {
    return res.status(403).json({ error: "STUDENT_MISMATCH",
      message: "You can only add yourself to a waitlist" });
  }
  try {
    const result = await joinWaitlist(studentId, courseCode);
    res.status(201).json({ message: `Added to waitlist (position ${result.position})`, ...result });
  } catch (err) {
    if (err instanceof RegistrationError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...err.details });
    }
    console.error(err);
    res.locals.errorDetail = err.message;
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected server error" });
  }
});

// Student-facing pages
app.get("/login", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.get("/courses/:code", (_req, res) => res.sendFile(path.join(publicDir, "course.html")));

// Test setup routes, only when NODE_ENV=test
if (process.env.NODE_ENV === "test") {
  const { testRouter } = await import("./testRoutes.js");
  app.use("/test", testRouter);
}

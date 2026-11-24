import express from "express";
import { pool } from "./db.js";
import { hashPassword } from "./auth.js";

// Fixture endpoints used by Playwright to arrange and clean up data through the API
export const testRouter = express.Router();

testRouter.post("/setup/course", async (req, res) => {
  const { code, title = "Test Course", availableSeats = 2, capacity = availableSeats,
          prerequisites = [] } = req.body;
  await pool.query(
    "INSERT INTO courses (code, title, capacity, available_seats) VALUES ($1, $2, $3, $4)",
    [code, title, capacity, availableSeats]
  );
  for (const p of prerequisites) {
    await pool.query("INSERT INTO prerequisites VALUES ($1, $2)", [code, p]);
  }
  res.status(201).json({ code });
});

testRouter.post("/setup/student", async (req, res) => {
  const { name = "Test Student", password = "test-password" } = req.body;
  const { rows } = await pool.query(
    "INSERT INTO students (name, password_hash) VALUES ($1, $2) RETURNING id",
    [name, hashPassword(password)]
  );
  res.status(201).json({ id: rows[0].id });
});

// Deletes only what the test created. Registrations cascade from students and courses.
testRouter.post("/teardown", async (req, res) => {
  const { studentIds = [], courseCodes = [] } = req.body;
  await pool.query("DELETE FROM audit_log WHERE student_id = ANY($1) OR course_code = ANY($2)",
                   [studentIds, courseCodes]);
  await pool.query("DELETE FROM students WHERE id = ANY($1)", [studentIds]);
  await pool.query("DELETE FROM courses WHERE code = ANY($1)", [courseCodes]);
  res.status(204).end();
});

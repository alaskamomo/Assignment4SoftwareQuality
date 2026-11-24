import crypto from "node:crypto";
import { pool } from "./db.js";

const COOKIE = "session";

// Stored as salt:hash with scrypt
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const attempt = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, "hex"));
}

// Pull the session token out of the cookie header
function sessionToken(req) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

// Logged-in student or null
export async function currentStudent(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.id, s.name FROM sessions x JOIN students s ON s.id = x.student_id
     WHERE x.token = $1`, [token]);
  return rows[0] ?? null;
}

// 401 if nobody is logged in
export async function requireLogin(req, res, next) {
  const student = await currentStudent(req);
  if (!student) {
    return res.status(401).json({ error: "NOT_LOGGED_IN", message: "Please log in to register" });
  }
  req.student = student;
  next();
}

export async function login(req, res) {
  const { studentId, password } = req.body ?? {};
  if (!Number.isInteger(studentId) || typeof password !== "string" || password === "") {
    return res.status(400).json({ error: "INVALID_REQUEST", message: "studentId (integer) and password are required" });
  }
  const { rows } = await pool.query(
    "SELECT id, name, password_hash FROM students WHERE id = $1", [studentId]);
  // same message either way so IDs can't be guessed
  if (rows.length === 0 || !checkPassword(password, rows[0].password_hash)) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Student ID or password is incorrect" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  await pool.query("INSERT INTO sessions (token, student_id) VALUES ($1, $2)", [token, studentId]);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  res.json({ message: "Logged in", studentId: rows[0].id, name: rows[0].name });
}

export async function logout(req, res) {
  const token = sessionToken(req);
  if (token) await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ message: "Logged out" });
}

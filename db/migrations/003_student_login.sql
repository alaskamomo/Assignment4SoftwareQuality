-- 003_student_login.sql: students log in with their student ID and a password
ALTER TABLE students ADD COLUMN password_hash TEXT;

-- One row per logged-in browser. Deleting a student logs them out everywhere.
CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

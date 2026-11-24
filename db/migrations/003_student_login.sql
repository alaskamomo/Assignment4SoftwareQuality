-- Student login
ALTER TABLE students ADD COLUMN password_hash TEXT;

-- one row per login
CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

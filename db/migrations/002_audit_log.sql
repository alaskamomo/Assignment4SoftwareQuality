-- 002_audit_log.sql: every successful registration writes an audit row
CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL,
  course_code TEXT NOT NULL,
  action      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

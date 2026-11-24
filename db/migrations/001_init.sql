-- Main tables
CREATE TABLE students (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL
);

CREATE TABLE courses (
  code            TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  capacity        INTEGER NOT NULL CHECK (capacity >= 0),
  available_seats INTEGER NOT NULL CHECK (available_seats >= 0)
);

-- prereqs for each course
CREATE TABLE prerequisites (
  course_code       TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  prerequisite_code TEXT NOT NULL,
  PRIMARY KEY (course_code, prerequisite_code)
);

-- courses a student already passed
CREATE TABLE completed_courses (
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  PRIMARY KEY (student_id, course_code)
);

CREATE TABLE registrations (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- no duplicate registrations
  UNIQUE (student_id, course_code)
);

# EnrollmentNow: Automated Integration and UI Tests

Monet Aughton  
11/24/2026  
MCS 4513  
Automated Integration and UI Tests  

This project contains API integration tests (Vitest + Supertest) and browser tests (Playwright) for the EnrollmentNow course registration system. The tests check both what the student sees and what actually gets saved in the database.

## Where these tests fit

In a test pyramid, unit tests sit at the bottom: many fast tests of single functions with no database or browser. Integration tests sit in the middle. Here they send real HTTP requests through Express, the registration service, and a real test database, so they catch problems in how the parts work together, like a rule that runs but whose result is ignored (Defect 2) or a database constraint firing (Defects 3 and 4). They are still fast (the 8 API tests run in about a second), so they carry most of the rule checking. UI tests sit at the top. They are slower and more fragile, so there are only a few, aimed at critical student journeys, and they check what the student actually sees, like the wording of the seat count (Defect 1). Each layer catches failures the others can miss, which is why every seeded defect is covered by one API test and one UI test.

## Project structure

```
assignment/
  src/                         minimal EnrollmentNow app built as the system under test (Express)
    app.js                     routes: /api/login, /api/logout, /api/me, /api/registrations,
                               /api/courses/:code, /login, /courses/:code
    auth.js                    student login: scrypt password hashes, session cookie, requireLogin
    registrationService.js     capacity, prerequisite, duplicate rules (one transaction)
    testRoutes.js              /test/setup/* and /test/teardown (only when NODE_ENV=test)
    public/login.html          login page (student ID + password)
    public/course.html         student course page (requires login)
  db/migrations/               001_init.sql, 002_audit_log.sql, 003_student_login.sql
  scripts/migrate.js           applies migrations and records them in schema_migrations
  scripts/run-all.js           runs everything (npm run test:all) and collects the evidence
  tests/
    registration.integration.test.js   1 success + 7 negative API tests (incl. not logged in, wrong password)
    registration.spec.js               4 Playwright UI tests (success, full, prerequisite, duplicate)
    testData.js                        setup, login, and cleanup helpers for the API tests
    globalSetup.js                     migrates and prints build/migration level (Vitest)
    playwright.globalSetup.js          same, plus browser version (Playwright)
  test-results/
    test-output.txt            output from all four runs (2 normal, 2 with all seeded defects on)
    server.log                 one line per API request from the app, split by run
    defect-1/ ... defect-4/    for each failed UI test: screenshot.png, trace.zip, error-context.md
  defect-report.md             write-ups for all four seeded defects
  vitest.config.js
  playwright.config.js
```

## Setup

Requirements: Node 20 or newer and PostgreSQL 14 or newer.

```bash
npm install
npx playwright install chromium

# Create a separate test database. The name must end in _test or the tests refuse to run.
createdb enrollmentnow_test

# Point the app and tests at it (default is postgres://postgres:postgres@localhost:5432/enrollmentnow_test)
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/enrollmentnow_test
# Homebrew PostgreSQL on macOS has no "postgres" user, so use your Mac username instead:
# export DATABASE_URL=postgres://$(whoami)@localhost:5432/enrollmentnow_test

npm run migrate
```

## Running the tests

```bash
npm run test:api     # Vitest + Supertest integration tests
npm run test:ui      # Playwright (starts the app on port 5173 automatically)
npm test             # both
npm run test:all     # 4 runs (normal + all seeded defects), rebuilds test-results/ and prints a summary

# Reproduce the Part 5 failures (see "Seeded defects" below)
SEED_DEFECT=all npm test                    # all four defects at once
SEED_DEFECT=skip-duplicate npm run test:ui  # one defect at a time
SEED_DEFECT=all npx playwright test --ui    # watch the four UI failures step by step

# Open a trace from a UI failure
npx playwright show-trace test-results/defect-1/trace.zip
```

## Login

Students log in at `/login` with their student ID and password. Opening a course page while logged out redirects to the login page and back again afterward. The server keeps a session in the `sessions` table and sends an HttpOnly `session` cookie. `POST /api/registrations` reads the student from that session and ignores any `studentId` in the request body, so one student cannot register another. Without a session it returns 401 `NOT_LOGGED_IN`. Passwords are stored as salted scrypt hashes and are masked as `***` in the server log.

Test students are created with the password `test-password`. The API tests log in through `POST /api/login` with a Supertest agent that keeps the cookie. The first UI test logs in through the real login form. The other UI tests log in with `page.request`, which shares cookies with the browser page, so they stay focused on the registration step.

## Seeded defects (Part 5)

I added four intentional errors to the app so the tests have real failures to catch and diagnose. They are off by default, so a normal run is fully green. Each one is turned on with the `SEED_DEFECT` environment variable (a comma list, or `all`) and is marked in the code with a `SEEDED DEFECT` comment. Each defect is caught by exactly one API test and one UI test, so with `SEED_DEFECT=all` the four UI tests all fail, each for its own reason.

| # | Switch | Where | What goes wrong | Caught by (API / UI) | Severity |
|---|---|---|---|---|---|
| 1 | `seat-label` | `seatLabel()` in `src/app.js` | One seat shows as "1 seats available" | success test / "student registers for an available course" | Low |
| 2 | `skip-prereq` | `registerStudent()` in `src/registrationService.js` | Missing prerequisites ignored; ineligible student gets 201 and takes a seat | prerequisite test / "student without the prerequisite..." | High |
| 3 | `skip-duplicate` | `registerStudent()` | Duplicate check skipped; database UNIQUE constraint fires, student gets 500 instead of 409 | duplicate test / "student who is already registered..." | Medium |
| 4 | `wrong-seat-column` | `registerStudent()` | Full check uses `capacity` instead of `available_seats`; database CHECK constraint fires, 500 instead of 409 | course full test / "student sees a clear message when the course is full" | Medium |

The four cover different kinds of failure: a cosmetic UI problem (1), a silent data-corrupting success that only the database assertions reveal (2), and two logic errors where the database constraints prevented data damage but the student still gets a confusing error (3 and 4). All four are written up in `defect-report.md`. The failing output is in RUN 3 and RUN 4 of `test-results/test-output.txt` and in `test-results/server.log`, which includes the database error text for the two 500s.

Isolation checks I ran:

```bash
npx vitest run --sequence.shuffle --sequence.seed=7   # random order
npx vitest run -t "duplicate"                         # one test alone
npx playwright test --repeat-each=3 --workers=3       # parallel, repeated
```

All of these passed, and afterward the students, courses, registrations, sessions, and audit_log tables were all empty.

## Server log

When `LOG_FILE` is set, the app writes one line per request with the time, build, active seeded defects, logged-in student (`student=<id>`), request body with any password masked, status code, and result code. Both test configs set `LOG_FILE=test-results/server.log`, so the log is saved automatically during every test run. For 500 errors the line also includes the database error text (`detail=...`). `npm run test:all` clears the log at the start; if you run the suites by hand, the log keeps appending. Running the app without `LOG_FILE` writes no log.

## Test environment and data strategy (Part 1)

- Separate database: `tests/testData.js` throws an error if the database name does not end in `_test`, so the suite cannot accidentally run against production.
- Known state per test: each test creates its own student (with a known password), logs in, and creates its own course, seat count, prerequisites, and (for the duplicate case) existing registration before it acts.
- Unique identifiers: course codes are generated as `MCS-<8 random hex chars>` and student IDs come from a sequence, so parallel tests never touch each other's rows.
- Cleanup: the API tests call `cleanupTestData()` in `afterEach`, and the UI tests call `POST /test/teardown` in `afterEach`. Both delete only the rows that test created. Registrations, prerequisites, sessions, and completed courses cascade on delete.
- Build and migration level: both suites print a line like `[env] build=enrollmentnow-1.0.0-local database=enrollmentnow_test migration=003_student_login` at the start of the run. Set `BUILD_ID` to label a real build.

## What the tests cover

| Test | Status | Side-effect assertions |
|---|---|---|
| Eligible student registers (2 seats) | 201 | exactly 1 registration, seats 2 to 1, 1 audit row |
| Course full | 409 | no registration, seats still 0, no new audit rows |
| Missing prerequisite | 422 | reason names `MCS-1514`, no registration, seats still 2 |
| Duplicate registration | 409 | still only 1 registration, seats unchanged |
| Unknown course | 404 | other course's seats unchanged, no audit or registration rows |
| Malformed body (logged in, no course code) | 400 | error code `INVALID_REQUEST` |
| Not logged in | 401 | `NOT_LOGGED_IN`, no registration, seats still 2, no new audit rows |
| Wrong password | 401 | `INVALID_CREDENTIALS`, no cookie set, no session row |
| UI: log in through the form, then register for available course | | redirected to login, "Logged in as ..." shown, success message, "1 seat available", status "Registered", seat count still 1 after reload |
| UI: course full (capacity 30, 0 left) | | "Course is full" shown, seat count and status unchanged |
| UI: missing prerequisite | | "Missing prerequisite: MCS-1514" shown, status "Not registered", seats still 2 after reload |
| UI: duplicate (first registration arranged through the API) | | "Student is already registered for this course" shown, seats still 2 after reload |

Locators follow the required order: `getByRole` for buttons, the dialog, the heading, and the status message; `getByLabel("Student ID")` and `getByLabel("Password")` on the login form; `getByText` for the registration status; and `getByTestId("seat-count")` only for the seat count, which has no role or label. No CSS selectors and no fixed sleeps are used. Every check uses a retrying `expect(locator)` assertion.

## Assumptions

- EnrollmentNow is a hypothetical system in the assignment, so I built a minimal version of it as the system under test. It follows the spec directly: endpoint `POST /api/registrations`, the status codes in the Part 3 table, and the page text from the Part 4 starter. It is intentionally small so the focus stays on the tests.
- Course codes use a hyphen (`MCS-2514`) so they work in URLs.
- When a course is full the API returns 409 with `canJoinWaitlist: true`. Actually joining the waitlist was out of scope for these tests.
- The check order is: course exists, student exists, not already registered, prerequisites met, seats available.
- The Part 5 failures come from four defects I seeded on purpose (see "Seeded defects" above).
- Login uses the student ID and a password. There is no sign-up page; students and passwords are created through the test setup routes. Sessions do not expire, since that was out of scope.
- The course page does not load a student's existing registration, so after a reload it always says "Not registered". The assignment does not say whether it should, so I noted it as a requirement gap in `defect-report.md` instead of filing it as a defect.

## Environment used for the submitted results

Results in `test-results/` are from `npm run test:all` on 2026-11-24 at 17:11 EST.

- Build: enrollmentnow-1.0.0-local
- OS: macOS 26.6 (Darwin 25.6.0), Apple Silicon MacBook Air
- Node: v26.13.1
- PostgreSQL: 16.16 (Homebrew), database `enrollmentnow_test`, migration level `003_student_login`
- Browser: Chromium 153.0.8010.12 (Playwright 1.63.0, headless)
- Vitest 5.1.1, Supertest 7.3.2, Express 4.22.3

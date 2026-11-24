# Defect Reports

Monet Aughton  
11/24/2026  
MCS 4513  
Automated Integration and UI Tests  

For Part 5 I planted four bugs in the app on purpose so the tests would have something real to catch. Each bug has its own switch through the `SEED_DEFECT` environment variable, and `SEED_DEFECT=all` turns on all four at once. In the code, each one is marked with a `SEEDED DEFECT` comment. When the switch is off, all 12 API tests and all 4 UI tests pass (RUN 1 and RUN 2 in `test-results/test-output.txt`). Before writing these up, I also turned the switches on one at a time to make sure each bug only broke the tests I expected it to.

| # | Defect | Switch | API test that catches it | UI test that catches it | Severity |
|---|---|---|---|---|---|
| 1 | Seat count reads "1 seats available" | `seat-label` | registers an eligible student | student registers for an available course | Low |
| 2 | Student registered without the prerequisite | `skip-prereq` | missing prerequisite returns 422 | student without the prerequisite sees which course is missing | High |
| 3 | Duplicate registration gives a server error | `skip-duplicate` | duplicate registration returns 409 | student who is already registered sees a duplicate message | Medium |
| 4 | Full course gives a server error | `wrong-seat-column` | course full returns 409 | student sees a clear message when the course is full | Medium |

All four were found in the same run on my laptop: a MacBook Air (Apple Silicon) on macOS 26.6 (Darwin 25.6.0), Node v26.13.1, PostgreSQL 16.16 from Homebrew with the `enrollmentnow_test` database at migration `004_waitlist`, and Chromium 153.0.8010.12 running headless through Playwright 1.63.0. The build was `enrollmentnow-1.0.0-local` with `SEED_DEFECT=all`. I ran it on 2026-11-24 at 17:41 EST. The API tests (RUN 3) ran at 17:41:17 and the UI tests (RUN 4) ran from 17:41:19 to 17:41:41. Each UI failure saved a screenshot, a trace, and a page snapshot into `test-results/defect-N/`, and a trace can be opened with `npx playwright show-trace test-results/defect-N/trace.zip`.

Every test runs as a logged-in student. Students log in on `/login` with their student ID and password, and the server identifies the student from the session cookie, not from anything typed on the course page. Test students are created with the password `test-password`.

---

## Defect 1: Seat count shows "1 seats available" after registration

| Field | Content |
|---|---|
| Title | Course page says "1 seats available" instead of "1 seat available" |
| Environment | Same as above, with the `seat-label` switch |
| Preconditions | A new student (made with `POST /test/setup/student`) who has not completed any courses. A "Software Testing" course with capacity 2, 2 open seats, and no prerequisites. The student is not registered yet. The student is logged out at the start and logs in during the steps. |
| Steps | 1. Open `/courses/<course code>`. The app redirects to `/login`. 2. Enter the student ID and password and click "Log in". The course page shows "Logged in as Playwright Student (Student ID <id>)". 3. Click "Register". 4. Click "Confirm" in the "Confirm registration" dialog. |
| Expected result | "Registration successful" shows up and the seat count changes to "1 seat available" (Part 4, steps 5 and 6). |
| Actual result | The registration goes through fine. The success message shows up and the status changes to "Registered", but the seat count says "1 seats available". The data underneath is right (1 registration, `available_seats = 1`). The API response has the same wrong text in `seatLabel`, so the problem is on the server side and not in the page. |
| Evidence | Caught by the UI test "student registers for an available course" (RUN 4, 2026-11-24 17:41:19 EST) and the API test "registers an eligible student and decrements the seat count" (RUN 3, 17:41:17 EST). Screenshot, trace, and snapshot are in `test-results/defect-1/`. In `test-results/server.log` the registration request returned a normal 201. |
| Severity | Low. It is only a grammar mistake, and the actual registration and seat count are correct. I would still fix it before release since students see it every time a course gets down to its last seat. |

```
UI:  Expected: "1 seat available"
     Received: "1 seats available"
     14 × locator resolved to <p id="seats" data-testid="seat-count">1 seats available</p>
API: -   "seatLabel": "1 seat available",
     +   "seatLabel": "1 seats available",
log: 2026-11-24T22:41:19.516Z seed=all POST /api/registrations student=142 body={"studentId":142,"courseCode":"MCS-2D608C01"} -> 201 result=registered
```

How I classified it: product defect. My first thought was a timing issue, but Playwright checked the text 14 times over 5 seconds and got the same thing every time, and the success message was already on screen by then. The other tests in the same run passed, so the environment was fine. I also checked that my expected text was not wrong. "1 seat available" is exactly what the assignment's starter example uses, and the test passes when the switch is off. Since the number itself is right and only the wording is off, I traced it to `seatLabel()` in `src/app.js`, which always adds an "s". The fix is to use "seat" when there is exactly one.

---

## Defect 2: Student without the prerequisite is registered successfully

| Field | Content |
|---|---|
| Title | Student who is missing a prerequisite still gets registered (201 instead of 422) |
| Environment | Same as above, with the `skip-prereq` switch |
| Preconditions | Student: new student who has not completed any courses (so not `MCS-1514`), logged in with their student ID and password. Course: "Software Testing" with capacity 2 and 2 open seats. Prerequisite: `MCS-1514`. Registration: the student is not registered yet. |
| Steps | Through the API: log in with `POST /api/login`, then send `POST /api/registrations` with the student ID and course code. Through the UI: while logged in, open the course page, click "Register", then "Confirm". |
| Expected result | The request is rejected with 422 and the message "Missing prerequisite: MCS-1514". No registration is created and the course still has 2 seats (Part 3). |
| Actual result | The student gets 201 and "Registration successful". A registration row is created, the seats drop from 2 to 1, and an audit row is written. A student who is not eligible ends up holding a real seat. |
| Evidence | Caught by the API test "missing prerequisite returns 422 naming the missing course" (RUN 3, 2026-11-24 17:41:18 EST) and the UI test "student without the prerequisite sees which course is missing" (RUN 4, 17:41:30 EST). Screenshot, trace, and snapshot are in `test-results/defect-2/`. The matching lines are in `test-results/server.log`. |
| Severity | High. This breaks one of the main registration rules and leaves bad data behind. An eligible student could lose a seat to someone who should not have it, and someone would have to find and remove these registrations by hand. I would not release with this. |

```
API: AssertionError: expected 201 to be 422
UI:  Expected: "Missing prerequisite: MCS-1514"
     Received: "Registration successful"
log: RUN 1 2026-11-24T22:41:14.824Z seed=none POST /api/registrations student=114 body={"studentId":114,"courseCode":"MCS-8C46A002"} -> 422 result=MISSING_PREREQUISITE
     RUN 3 2026-11-24T22:41:18.007Z seed=all  POST /api/registrations student=131 body={"studentId":131,"courseCode":"MCS-68EB5C4E"} -> 201 result=registered
     RUN 4 2026-11-24T22:41:30.540Z seed=all  POST /api/registrations student=144 body={"studentId":144,"courseCode":"MCS-43612A78"} -> 201 result=registered
DB when I reproduced it by hand afterward (same build and switch): available_seats=1 registrations=1 audit_rows=1
```

How I classified it: product defect. I double checked the test data first, and the student really has not completed `MCS-1514`. The log makes the comparison easy. On the normal build (RUN 1) the same kind of request gets a 422, and with the switch on it gets a 201. There is no waiting involved in the API test, so timing is not a factor. Looking at `registerStudent()` in `src/registrationService.js`, the prerequisite query still runs and finds the missing course, but the code ignores the result and keeps going. The fix is to reject the request whenever that query returns anything.

This defect is a big part of why my tests check the database and not just the response. From the response alone, it looks like a normal, successful registration.

---

## Defect 3: Duplicate registration returns a server error instead of 409

| Field | Content |
|---|---|
| Title | Registering twice for the same course shows "Unexpected server error" instead of a duplicate message |
| Environment | Same as above, with the `skip-duplicate` switch |
| Preconditions | Student: new student with no completed courses, logged in with their student ID and password. Course: "Software Testing" with capacity 3. Prerequisite: none. Registration: the student is already registered once (set up through `POST /api/registrations` in the same session), so 2 of 3 seats are left. |
| Steps | Through the API: send `POST /api/registrations` again with the same student ID and course code while logged in as that student. Through the UI: while logged in, open the course page, click "Register", then "Confirm". |
| Expected result | 409 with "Student is already registered for this course". There is still only 1 registration and 2 seats left (Part 3). |
| Actual result | The student gets a 500 and the page just says "Unexpected server error". The data is still fine (1 registration, 2 seats, 1 audit row), but only because the database has a UNIQUE rule on (student_id, course_code) that blocked the second insert. The student is not told what went wrong. |
| Evidence | Caught by the API test "duplicate registration returns 409 and only one registration remains" (RUN 3, 2026-11-24 17:41:18 EST) and the UI test "student who is already registered sees a duplicate message" (RUN 4, 17:41:35 EST). Screenshot, trace, and snapshot are in `test-results/defect-3/`. The database error is in `test-results/server.log` and in the server output in `test-output.txt`. |
| Severity | Medium. Nothing gets corrupted, but the student sees a generic error instead of a clear message, and every duplicate attempt would look like a server crash in the logs. The app is relying on the database to catch this instead of checking it itself. |

```
API: AssertionError: expected 500 to be 409
UI:  Expected: "Student is already registered for this course"
     Received: "Unexpected server error"
log: 2026-11-24T22:41:35.951Z seed=all POST /api/registrations student=145 body={"studentId":145,"courseCode":"MCS-837BDC0C"} -> 201 result=registered
     2026-11-24T22:41:36.046Z seed=all POST /api/registrations student=145 body={"studentId":145,"courseCode":"MCS-837BDC0C"} -> 500 result=INTERNAL_ERROR
       detail="duplicate key value violates unique constraint registrations_student_id_course_code_key"
server stderr: Key (student_id, course_code)=(145, MCS-837BDC0C) already exists.
DB when I reproduced it by hand afterward (same build and switch): available_seats=2 registrations=1 audit_rows=1
```

How I classified it: product defect. The server log shows the exact database error, so the request really did reach the database and get rejected there. That rules out a problem with the test or with timing, and the test passes normally with the switch off. The duplicate check in `registerStudent()` is supposed to catch this first, but it is being skipped. To fix it I would put the check back, and I would also turn a UNIQUE error into a 409 as a backup in case two requests ever get past the check at the same time.

One more thing I noticed in the screenshot: the page says "Registration status: Not registered" even though this student is registered. That happens on every build, because the course page never looks up whether the student is already registered. The assignment does not say whether the page should show that, so I am treating it as a requirement gap and not a defect. I would ask the instructor or product owner about it.

---

## Defect 4: Full course returns a server error instead of "Course is full"

| Field | Content |
|---|---|
| Title | Registering for a full course shows "Unexpected server error" instead of "Course is full" |
| Environment | Same as above, with the `wrong-seat-column` switch |
| Preconditions | Student: new student with no completed courses, logged in with their student ID and password. Course: "Software Testing" with capacity 30 and 0 seats left. Prerequisite: none, so the student is eligible. Registration: the student is not registered yet. |
| Steps | Through the API: log in with `POST /api/login`, then send `POST /api/registrations` with the student ID and course code. Through the UI: while logged in, open the course page, click "Register", then "Confirm". |
| Expected result | 409 "Course is full". No registration is created and the seats stay at 0 (Part 3). |
| Actual result | The student gets a 500 and "Unexpected server error". The check for a full course looks at total capacity (30) when it should look at seats left (0), so the request gets through. The code then tries to drop the seat count to -1, and the database rejects that. Nothing is saved (0 seats, 0 registrations, 0 audit rows). Because the page never gets the "Course is full" response, the "Join waitlist" button never shows up either. |
| Evidence | Caught by the API test "course full returns 409 and changes nothing" (RUN 3, 2026-11-24 17:41:17 EST) and the UI test "student sees a clear message when the course is full" (RUN 4, 17:41:25 EST). Screenshot, trace, and snapshot are in `test-results/defect-4/`. The database error is in `test-results/server.log` and in the server output in `test-output.txt`. |
| Severity | Medium. No bad data gets saved, but a student trying to join a full course gets a confusing error, never finds out the course is full, and never gets the option to join the waitlist. Without the database rule this bug would actually overbook the course. |

```
API: AssertionError: expected 500 to be 409
UI:  Expected: "Course is full"
     Received: "Unexpected server error"
log: 2026-11-24T22:41:25.044Z seed=all POST /api/registrations student=143 body={"studentId":143,"courseCode":"MCS-9F41C358"} -> 500 result=INTERNAL_ERROR
       detail="new row for relation courses violates check constraint courses_available_seats_check"
server stderr: Failing row contains (MCS-9F41C358, Software Testing, 30, -1).
DB when I reproduced it by hand afterward (same build and switch): available_seats=0 registrations=0 audit_rows=0
```

How I classified it: product defect. The most useful clue was the "failing row" line from the database: capacity 30 and available seats -1. That means the app tried to give away a seat that did not exist. The test passes with the switch off, so the test itself is fine. The bug is in `registerStudent()`, which compares `capacity` when it should compare `available_seats`. The fix is to check `available_seats <= 0`.

I did not catch this one on the first try. My original UI test for a full course set up a course with a capacity of 0 and 0 seats left, so even the wrong column said the course was full, and the test passed. Once I changed the test data to something more realistic (30 seats total, none left), the UI test caught it. The API test already used capacity 30, so it caught it from the start. That one was a mistake in my own test data, and I fixed it before collecting this evidence.

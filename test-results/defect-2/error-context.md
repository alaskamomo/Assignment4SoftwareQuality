# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registration.spec.js >> student without the prerequisite sees which course is missing
- Location: tests/registration.spec.js:78:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('status')
Expected: "Missing prerequisite: MCS-1514"
Received: "Registration successful"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')
    - locator resolved to <p id="message" role="status"></p>
    - unexpected value ""
    13 × locator resolved to <p class="ok" id="message" role="status">Registration successful</p>
       - unexpected value "Registration successful"

```

```yaml
- status: Registration successful
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { randomUUID } from "node:crypto";
  3   | 
  4   | // Track what each test creates so afterEach can remove exactly that
  5   | let created;
  6   | 
  7   | test.beforeEach(() => { created = { studentIds: [], courseCodes: [] }; });
  8   | 
  9   | test.afterEach(async ({ request }) => {
  10  |   await request.post("/test/teardown", { data: created });
  11  | });
  12  | 
  13  | // Arrange data through the test-only API instead of clicking through admin screens
  14  | async function setupCourse(request, { availableSeats, capacity = availableSeats, prerequisites = [] }) {
  15  |   const code = `MCS-${randomUUID().slice(0, 8).toUpperCase()}`;
  16  |   const res = await request.post("/test/setup/course", {
  17  |     data: { code, title: "Software Testing", availableSeats, capacity, prerequisites },
  18  |   });
  19  |   expect(res.status()).toBe(201);
  20  |   created.courseCodes.push(code);
  21  |   return code;
  22  | }
  23  | 
  24  | async function setupStudent(request) {
  25  |   const res = await request.post("/test/setup/student", { data: { name: "Playwright Student" } });
  26  |   expect(res.status()).toBe(201);
  27  |   const { id } = await res.json();
  28  |   created.studentIds.push(id);
  29  |   return id;
  30  | }
  31  | 
  32  | test("student registers for an available course", async ({ page, request }) => {
  33  |   const courseCode = await setupCourse(request, { availableSeats: 2 });
  34  |   const studentId = await setupStudent(request);
  35  | 
  36  |   await page.goto(`/courses/${courseCode}`);
  37  |   // Wait for the page to show the known starting state before acting
  38  |   await expect(page.getByRole("heading", { name: `${courseCode}: Software Testing` })).toBeVisible();
  39  |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  40  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  41  | 
  42  |   // Act the way a student would: fill the labeled field, click, confirm
  43  |   await page.getByLabel("Student ID").fill(String(studentId));
  44  |   await page.getByRole("button", { name: "Register" }).click();
  45  | 
  46  |   const dialog = page.getByRole("dialog", { name: "Confirm registration" });
  47  |   await expect(dialog).toBeVisible();
  48  |   await dialog.getByRole("button", { name: "Confirm" }).click();
  49  | 
  50  |   // Visible outcome: success message, seat count, registration status
  51  |   await expect(page.getByRole("status")).toHaveText("Registration successful");
  52  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  53  |   await expect(page.getByText("Registration status: Registered")).toBeVisible();
  54  |   await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
  55  | 
  56  |   // Persistent effect: reloading shows the server-side seat count, not just the client state
  57  |   await page.reload();
  58  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  59  | });
  60  | 
  61  | test("student sees a clear message when the course is full", async ({ page, request }) => {
  62  |   // Realistic full course: 30 total seats, none left
  63  |   const courseCode = await setupCourse(request, { capacity: 30, availableSeats: 0 });
  64  |   const studentId = await setupStudent(request);
  65  | 
  66  |   await page.goto(`/courses/${courseCode}`);
  67  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  68  | 
  69  |   await page.getByLabel("Student ID").fill(String(studentId));
  70  |   await page.getByRole("button", { name: "Register" }).click();
  71  |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  72  | 
  73  |   await expect(page.getByRole("status")).toHaveText("Course is full");
  74  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  75  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  76  | });
  77  | 
  78  | test("student without the prerequisite sees which course is missing", async ({ page, request }) => {
  79  |   const courseCode = await setupCourse(request, { availableSeats: 2, prerequisites: ["MCS-1514"] });
  80  |   const studentId = await setupStudent(request); // has not completed MCS-1514
  81  | 
  82  |   await page.goto(`/courses/${courseCode}`);
  83  |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  84  | 
  85  |   await page.getByLabel("Student ID").fill(String(studentId));
  86  |   await page.getByRole("button", { name: "Register" }).click();
  87  |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  88  | 
  89  |   // The reason must name the missing course, and no seat may be taken
> 90  |   await expect(page.getByRole("status")).toHaveText("Missing prerequisite: MCS-1514");
      |                                          ^ Error: expect(locator).toHaveText(expected) failed
  91  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  92  |   await page.reload();
  93  |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  94  | });
  95  | 
  96  | test("student who is already registered sees a duplicate message", async ({ page, request }) => {
  97  |   const courseCode = await setupCourse(request, { availableSeats: 3 });
  98  |   const studentId = await setupStudent(request);
  99  |   // Arrange the first registration through the API, so the UI step is the duplicate
  100 |   const first = await request.post("/api/registrations", { data: { studentId, courseCode } });
  101 |   expect(first.status()).toBe(201);
  102 | 
  103 |   await page.goto(`/courses/${courseCode}`);
  104 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  105 | 
  106 |   await page.getByLabel("Student ID").fill(String(studentId));
  107 |   await page.getByRole("button", { name: "Register" }).click();
  108 |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  109 | 
  110 |   // Clear duplicate message, and the second attempt must not take another seat
  111 |   await expect(page.getByRole("status")).toHaveText("Student is already registered for this course");
  112 |   await page.reload();
  113 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  114 | });
  115 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registration.spec.js >> student without the prerequisite sees which course is missing
- Location: tests/registration.spec.js:94:1

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
  24  | const PASSWORD = "test-password";
  25  | 
  26  | async function setupStudent(request) {
  27  |   const res = await request.post("/test/setup/student", { data: { name: "Playwright Student", password: PASSWORD } });
  28  |   expect(res.status()).toBe(201);
  29  |   const { id } = await res.json();
  30  |   created.studentIds.push(id);
  31  |   return id;
  32  | }
  33  | 
  34  | // Fast login for tests whose focus is not the login screen. page.request shares
  35  | // cookies with the browser page, so the page is logged in afterwards.
  36  | async function loginViaApi(page, studentId) {
  37  |   const res = await page.request.post("/api/login", { data: { studentId, password: PASSWORD } });
  38  |   expect(res.status()).toBe(200);
  39  | }
  40  | 
  41  | test("student registers for an available course", async ({ page, request }) => {
  42  |   const courseCode = await setupCourse(request, { availableSeats: 2 });
  43  |   const studentId = await setupStudent(request);
  44  | 
  45  |   // Not logged in yet: opening the course sends the student to the login page
  46  |   await page.goto(`/courses/${courseCode}`);
  47  |   await expect(page).toHaveURL(/\/login\?next=/);
  48  |   await page.getByLabel("Student ID").fill(String(studentId));
  49  |   await page.getByLabel("Password").fill(PASSWORD);
  50  |   await page.getByRole("button", { name: "Log in" }).click();
  51  | 
  52  |   // Back on the course page as that student
  53  |   await expect(page.getByText(`Logged in as Playwright Student (Student ID ${studentId})`)).toBeVisible();
  54  |   // Wait for the page to show the known starting state before acting
  55  |   await expect(page.getByRole("heading", { name: `${courseCode}: Software Testing` })).toBeVisible();
  56  |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  57  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  58  | 
  59  |   // Act the way a student would: click Register, then confirm
  60  |   await page.getByRole("button", { name: "Register" }).click();
  61  | 
  62  |   const dialog = page.getByRole("dialog", { name: "Confirm registration" });
  63  |   await expect(dialog).toBeVisible();
  64  |   await dialog.getByRole("button", { name: "Confirm" }).click();
  65  | 
  66  |   // Visible outcome: success message, seat count, registration status
  67  |   await expect(page.getByRole("status")).toHaveText("Registration successful");
  68  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  69  |   await expect(page.getByText("Registration status: Registered")).toBeVisible();
  70  |   await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
  71  | 
  72  |   // Persistent effect: reloading shows the server-side seat count, not just the client state
  73  |   await page.reload();
  74  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  75  | });
  76  | 
  77  | test("student sees a clear message when the course is full", async ({ page, request }) => {
  78  |   // Realistic full course: 30 total seats, none left
  79  |   const courseCode = await setupCourse(request, { capacity: 30, availableSeats: 0 });
  80  |   const studentId = await setupStudent(request);
  81  | 
  82  |   await loginViaApi(page, studentId);
  83  |   await page.goto(`/courses/${courseCode}`);
  84  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  85  | 
  86  |   await page.getByRole("button", { name: "Register" }).click();
  87  |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  88  | 
  89  |   await expect(page.getByRole("status")).toHaveText("Course is full");
  90  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  91  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  92  | });
  93  | 
  94  | test("student without the prerequisite sees which course is missing", async ({ page, request }) => {
  95  |   const courseCode = await setupCourse(request, { availableSeats: 2, prerequisites: ["MCS-1514"] });
  96  |   const studentId = await setupStudent(request); // has not completed MCS-1514
  97  | 
  98  |   await loginViaApi(page, studentId);
  99  |   await page.goto(`/courses/${courseCode}`);
  100 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  101 | 
  102 |   await page.getByRole("button", { name: "Register" }).click();
  103 |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  104 | 
  105 |   // The reason must name the missing course, and no seat may be taken
> 106 |   await expect(page.getByRole("status")).toHaveText("Missing prerequisite: MCS-1514");
      |                                          ^ Error: expect(locator).toHaveText(expected) failed
  107 |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  108 |   await page.reload();
  109 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  110 | });
  111 | 
  112 | test("student who is already registered sees a duplicate message", async ({ page, request }) => {
  113 |   const courseCode = await setupCourse(request, { availableSeats: 3 });
  114 |   const studentId = await setupStudent(request);
  115 |   await loginViaApi(page, studentId);
  116 |   // Arrange the first registration through the API, so the UI step is the duplicate
  117 |   const first = await page.request.post("/api/registrations", { data: { courseCode } });
  118 |   expect(first.status()).toBe(201);
  119 | 
  120 |   await page.goto(`/courses/${courseCode}`);
  121 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  122 | 
  123 |   await page.getByRole("button", { name: "Register" }).click();
  124 |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  125 | 
  126 |   // Clear duplicate message, and the second attempt must not take another seat
  127 |   await expect(page.getByRole("status")).toHaveText("Student is already registered for this course");
  128 |   await page.reload();
  129 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  130 | });
  131 | 
```
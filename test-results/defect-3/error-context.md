# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: registration.spec.js >> student who is already registered sees a duplicate message
- Location: tests/registration.spec.js:118:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('status')
Expected: "Student is already registered for this course"
Received: "Unexpected server error"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')
    - locator resolved to <p id="message" role="status"></p>
    - unexpected value ""
    13 × locator resolved to <p class="err" id="message" role="status">Unexpected server error</p>
       - unexpected value "Unexpected server error"

```

```yaml
- status: Unexpected server error
```

# Test source

```ts
  33  | 
  34  | // Quick login (shares cookies with the page)
  35  | async function loginViaApi(page, studentId) {
  36  |   const res = await page.request.post("/api/login", { data: { studentId, password: PASSWORD } });
  37  |   expect(res.status()).toBe(200);
  38  | }
  39  | 
  40  | test("student registers for an available course", async ({ page, request }) => {
  41  |   const courseCode = await setupCourse(request, { availableSeats: 2 });
  42  |   const studentId = await setupStudent(request);
  43  | 
  44  |   // not logged in yet, so it goes to the login page
  45  |   await page.goto(`/courses/${courseCode}`);
  46  |   await expect(page).toHaveURL(/\/login\?next=/);
  47  |   await page.getByLabel("Student ID").fill(String(studentId));
  48  |   await page.getByLabel("Password").fill(PASSWORD);
  49  |   await page.getByRole("button", { name: "Log in" }).click();
  50  | 
  51  |   // back on the course page
  52  |   await expect(page.getByText(`Logged in as Playwright Student (Student ID ${studentId})`)).toBeVisible();
  53  |   // starting state
  54  |   await expect(page.getByRole("heading", { name: `${courseCode}: Software Testing` })).toBeVisible();
  55  |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  56  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  57  | 
  58  |   // register and confirm
  59  |   await page.getByRole("button", { name: "Register" }).click();
  60  | 
  61  |   const dialog = page.getByRole("dialog", { name: "Confirm registration" });
  62  |   await expect(dialog).toBeVisible();
  63  |   await dialog.getByRole("button", { name: "Confirm" }).click();
  64  | 
  65  |   // what the student sees
  66  |   await expect(page.getByRole("status")).toHaveText("Registration successful");
  67  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  68  |   await expect(page.getByText("Registration status: Registered")).toBeVisible();
  69  |   await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
  70  | 
  71  |   // reload to make sure it saved
  72  |   await page.reload();
  73  |   await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  74  | });
  75  | 
  76  | test("student sees a clear message when the course is full", async ({ page, request }) => {
  77  |   // 30 seats, none left
  78  |   const courseCode = await setupCourse(request, { capacity: 30, availableSeats: 0 });
  79  |   const studentId = await setupStudent(request);
  80  | 
  81  |   await loginViaApi(page, studentId);
  82  |   await page.goto(`/courses/${courseCode}`);
  83  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  84  | 
  85  |   await page.getByRole("button", { name: "Register" }).click();
  86  |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  87  | 
  88  |   await expect(page.getByRole("status")).toHaveText("Course is full");
  89  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  90  |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  91  | 
  92  |   // join the waitlist instead
  93  |   await page.getByRole("button", { name: "Join waitlist" }).click();
  94  |   await expect(page.getByRole("status")).toHaveText("Added to waitlist (position 1)");
  95  |   await expect(page.getByText("Registration status: Waitlisted (position 1)")).toBeVisible();
  96  |   await page.reload();
  97  |   await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  98  | });
  99  | 
  100 | test("student without the prerequisite sees which course is missing", async ({ page, request }) => {
  101 |   const courseCode = await setupCourse(request, { availableSeats: 2, prerequisites: ["MCS-1514"] });
  102 |   const studentId = await setupStudent(request); // has not completed MCS-1514
  103 | 
  104 |   await loginViaApi(page, studentId);
  105 |   await page.goto(`/courses/${courseCode}`);
  106 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  107 | 
  108 |   await page.getByRole("button", { name: "Register" }).click();
  109 |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  110 | 
  111 |   // should name the missing course and not take a seat
  112 |   await expect(page.getByRole("status")).toHaveText("Missing prerequisite: MCS-1514");
  113 |   await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  114 |   await page.reload();
  115 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  116 | });
  117 | 
  118 | test("student who is already registered sees a duplicate message", async ({ page, request }) => {
  119 |   const courseCode = await setupCourse(request, { availableSeats: 3 });
  120 |   const studentId = await setupStudent(request);
  121 |   await loginViaApi(page, studentId);
  122 |   // first registration through the API
  123 |   const first = await page.request.post("/api/registrations", { data: { studentId, courseCode } });
  124 |   expect(first.status()).toBe(201);
  125 | 
  126 |   await page.goto(`/courses/${courseCode}`);
  127 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  128 | 
  129 |   await page.getByRole("button", { name: "Register" }).click();
  130 |   await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  131 | 
  132 |   // second try shouldn't take another seat
> 133 |   await expect(page.getByRole("status")).toHaveText("Student is already registered for this course");
      |                                          ^ Error: expect(locator).toHaveText(expected) failed
  134 |   await page.reload();
  135 |   await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  136 | });
  137 | 
```
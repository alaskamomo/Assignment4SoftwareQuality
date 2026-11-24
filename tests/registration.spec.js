import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Track what each test creates so afterEach can remove exactly that
let created;

test.beforeEach(() => { created = { studentIds: [], courseCodes: [] }; });

test.afterEach(async ({ request }) => {
  await request.post("/test/teardown", { data: created });
});

// Arrange data through the test-only API instead of clicking through admin screens
async function setupCourse(request, { availableSeats, capacity = availableSeats, prerequisites = [] }) {
  const code = `MCS-${randomUUID().slice(0, 8).toUpperCase()}`;
  const res = await request.post("/test/setup/course", {
    data: { code, title: "Software Testing", availableSeats, capacity, prerequisites },
  });
  expect(res.status()).toBe(201);
  created.courseCodes.push(code);
  return code;
}

const PASSWORD = "test-password";

async function setupStudent(request) {
  const res = await request.post("/test/setup/student", { data: { name: "Playwright Student", password: PASSWORD } });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  created.studentIds.push(id);
  return id;
}

// Fast login for tests whose focus is not the login screen. page.request shares
// cookies with the browser page, so the page is logged in afterwards.
async function loginViaApi(page, studentId) {
  const res = await page.request.post("/api/login", { data: { studentId, password: PASSWORD } });
  expect(res.status()).toBe(200);
}

test("student registers for an available course", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 2 });
  const studentId = await setupStudent(request);

  // Not logged in yet: opening the course sends the student to the login page
  await page.goto(`/courses/${courseCode}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Student ID").fill(String(studentId));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // Back on the course page as that student
  await expect(page.getByText(`Logged in as Playwright Student (Student ID ${studentId})`)).toBeVisible();
  // Wait for the page to show the known starting state before acting
  await expect(page.getByRole("heading", { name: `${courseCode}: Software Testing` })).toBeVisible();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  await expect(page.getByText("Registration status: Not registered")).toBeVisible();

  // Act the way a student would: click Register, then confirm
  await page.getByRole("button", { name: "Register" }).click();

  const dialog = page.getByRole("dialog", { name: "Confirm registration" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();

  // Visible outcome: success message, seat count, registration status
  await expect(page.getByRole("status")).toHaveText("Registration successful");
  await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  await expect(page.getByText("Registration status: Registered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();

  // Persistent effect: reloading shows the server-side seat count, not just the client state
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
});

test("student sees a clear message when the course is full", async ({ page, request }) => {
  // Realistic full course: 30 total seats, none left
  const courseCode = await setupCourse(request, { capacity: 30, availableSeats: 0 });
  const studentId = await setupStudent(request);

  await loginViaApi(page, studentId);
  await page.goto(`/courses/${courseCode}`);
  await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByRole("status")).toHaveText("Course is full");
  await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
  await expect(page.getByText("Registration status: Not registered")).toBeVisible();
});

test("student without the prerequisite sees which course is missing", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 2, prerequisites: ["MCS-1514"] });
  const studentId = await setupStudent(request); // has not completed MCS-1514

  await loginViaApi(page, studentId);
  await page.goto(`/courses/${courseCode}`);
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  // The reason must name the missing course, and no seat may be taken
  await expect(page.getByRole("status")).toHaveText("Missing prerequisite: MCS-1514");
  await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
});

test("student who is already registered sees a duplicate message", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 3 });
  const studentId = await setupStudent(request);
  await loginViaApi(page, studentId);
  // Arrange the first registration through the API, so the UI step is the duplicate
  const first = await page.request.post("/api/registrations", { data: { courseCode } });
  expect(first.status()).toBe(201);

  await page.goto(`/courses/${courseCode}`);
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  // Clear duplicate message, and the second attempt must not take another seat
  await expect(page.getByRole("status")).toHaveText("Student is already registered for this course");
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
});

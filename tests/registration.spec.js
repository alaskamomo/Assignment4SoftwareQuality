import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// What each test made, so afterEach can delete it
let created;

test.beforeEach(() => { created = { studentIds: [], courseCodes: [] }; });

test.afterEach(async ({ request }) => {
  await request.post("/test/teardown", { data: created });
});

// Set up data through the test API
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

// Quick login (shares cookies with the page)
async function loginViaApi(page, studentId) {
  const res = await page.request.post("/api/login", { data: { studentId, password: PASSWORD } });
  expect(res.status()).toBe(200);
}

test("student registers for an available course", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 2 });
  const studentId = await setupStudent(request);

  // not logged in yet, so it goes to the login page
  await page.goto(`/courses/${courseCode}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Student ID").fill(String(studentId));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // back on the course page
  await expect(page.getByText(`Logged in as Playwright Student (Student ID ${studentId})`)).toBeVisible();
  // starting state
  await expect(page.getByRole("heading", { name: `${courseCode}: Software Testing` })).toBeVisible();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
  await expect(page.getByText("Registration status: Not registered")).toBeVisible();

  // register and confirm
  await page.getByRole("button", { name: "Register" }).click();

  const dialog = page.getByRole("dialog", { name: "Confirm registration" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();

  // what the student sees
  await expect(page.getByRole("status")).toHaveText("Registration successful");
  await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
  await expect(page.getByText("Registration status: Registered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();

  // reload to make sure it saved
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("1 seat available");
});

test("student sees a clear message when the course is full", async ({ page, request }) => {
  // 30 seats, none left
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

  // join the waitlist instead
  await page.getByRole("button", { name: "Join waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText("Added to waitlist (position 1)");
  await expect(page.getByText("Registration status: Waitlisted (position 1)")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("0 seats available");
});

test("student without the prerequisite sees which course is missing", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 2, prerequisites: ["MCS-1514"] });
  const studentId = await setupStudent(request); // has not completed MCS-1514

  await loginViaApi(page, studentId);
  await page.goto(`/courses/${courseCode}`);
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  // should name the missing course and not take a seat
  await expect(page.getByRole("status")).toHaveText("Missing prerequisite: MCS-1514");
  await expect(page.getByText("Registration status: Not registered")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
});

test("student who is already registered sees a duplicate message", async ({ page, request }) => {
  const courseCode = await setupCourse(request, { availableSeats: 3 });
  const studentId = await setupStudent(request);
  await loginViaApi(page, studentId);
  // first registration through the API
  const first = await page.request.post("/api/registrations", { data: { studentId, courseCode } });
  expect(first.status()).toBe(201);

  await page.goto(`/courses/${courseCode}`);
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();

  // second try shouldn't take another seat
  await expect(page.getByRole("status")).toHaveText("Student is already registered for this course");
  await page.reload();
  await expect(page.getByTestId("seat-count")).toHaveText("2 seats available");
});

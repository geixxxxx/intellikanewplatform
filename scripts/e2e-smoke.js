const path = require("node:path");

const { chromium } = require(
  "/Users/yaromirtribunsky/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);

const baseUrl = "http://127.0.0.1:3000";
const stamp = Date.now();

const student = {
  fullName: `Иван Тестов ${stamp}`,
  email: `student.${stamp}@example.com`,
  password: "StudentPass2026!"
};

const teacher = {
  fullName: `Мария Тестова ${stamp}`,
  email: `teacher.${stamp}@example.com`,
  password: "TeacherPass2026!"
};

const webinar = {
  title: `YouTube вебинар ${stamp}`,
  description: "Разбор задач и план подготовки к следующей неделе.",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
};

const homework = {
  title: `Домашка ${stamp}`,
  course: "11 класс · Основной поток",
  instructions: "Реши все задания, подпиши ответы и приложи ход рассуждений."
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatLocalDateTime(offsetHours) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

async function expectUrl(page, expectedPart) {
  await page.waitForURL((url) => url.toString().includes(expectedPart), {
    timeout: 15000
  });
}

async function expectText(locator, expectedText) {
  await locator.waitFor({ state: "visible", timeout: 15000 });

  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    const text = await locator.innerText();

    if (text.includes(expectedText)) {
      return;
    }

    await locator.page().waitForTimeout(250);
  }

  const finalText = await locator.innerText();
  assert(finalText.includes(expectedText), `Expected text "${expectedText}" in "${finalText}"`);
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/login/`, { waitUntil: "networkidle" });
  await page.fill("#email-input", email);
  await page.fill("#password-input", password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.locator("#continue-button").click()
  ]);
}

async function registerStudent(page) {
  await page.goto(`${baseUrl}/login/`, { waitUntil: "networkidle" });
  await page.locator("#auth-mode-switch [data-mode='register']").click();
  await page.fill("#full-name-input", student.fullName);
  await page.fill("#email-input", student.email);
  await page.fill("#password-input", student.password);
  await page.selectOption("#grade-input", "11 класс");
  await page.fill("#exam-year-input", "2026");
  await Promise.all([
    expectUrl(page, "/student/dashboard/"),
    page.locator("#continue-button").click()
  ]);
  await expectText(page.locator("#student-name"), student.fullName);
}

async function registerTeacher(page) {
  await page.goto(`${baseUrl}/login/`, { waitUntil: "networkidle" });
  await page.locator("#auth-mode-switch [data-mode='register']").click();
  await page.locator("#role-switch [data-role='teacher']").click();
  await page.fill("#full-name-input", teacher.fullName);
  await page.fill("#email-input", teacher.email);
  await page.fill("#password-input", teacher.password);
  await Promise.all([
    expectUrl(page, "/teacher/dashboard/"),
    page.locator("#continue-button").click()
  ]);
  await expectText(page.locator("#teacher-name"), teacher.fullName);
}

async function createWebinar(page) {
  await page.fill("#webinar-title", webinar.title);
  await page.selectOption("#webinar-subject", "Химия");
  await page.selectOption("#webinar-type", "youtube");
  await page.fill("#webinar-date", formatLocalDateTime(24));
  await page.fill("#webinar-url", webinar.url);
  await page.fill("#webinar-description", webinar.description);
  await page.locator("#webinar-form button[type='submit']").click();
  await expectText(page.locator("#webinar-form-note"), "Вебинар сохранён");
  await expectText(page.locator("#teacher-webinars"), webinar.title);
}

async function createHomework(page) {
  await page.selectOption("#homework-subject", "Химия");
  await page.fill("#homework-title", homework.title);
  await page.fill("#homework-deadline", formatLocalDateTime(48));
  await page.fill("#homework-course", homework.course);
  await page.fill("#homework-instructions", homework.instructions);
  await page.locator("#homework-images").setInputFiles([
    {
      name: "scheme.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=",
        "base64"
      )
    }
  ]);
  await page.locator("#homework-form button[type='submit']").click();
  await expectText(page.locator("#homework-form-note"), "Домашнее задание сохранено");
  await expectText(page.locator("#teacher-homeworks"), homework.title);
}

async function logout(page, buttonSelector) {
  await page.locator(buttonSelector).click();
  await expectUrl(page, "/login/");
}

async function verifyStudentSeesContent(page) {
  await login(page, student.email, student.password);
  await expectUrl(page, "/student/dashboard/");
  await expectText(page.locator("#timeline"), webinar.title);
  await expectText(page.locator("#video-library"), webinar.title);
  await expectText(page.locator("#homework-list"), homework.title);
  const imageCount = await page.locator("#homework-list img").count();
  assert(imageCount > 0, "Expected at least one homework image in student dashboard");
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const pageErrors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await registerStudent(page);
    await logout(page, "#student-logout-button");
    await registerTeacher(page);
    await expectText(page.locator("#teacher-students"), student.fullName);
    await createWebinar(page);
    await createHomework(page);
    await logout(page, "#teacher-logout-button");
    await verifyStudentSeesContent(page);

    console.log(
      JSON.stringify(
        {
          ok: true,
          studentEmail: student.email,
          teacherEmail: teacher.email,
          webinarTitle: webinar.title,
          homeworkTitle: homework.title,
          pageErrors
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

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

const editedWebinarTitle = `Оформленный вебинар ${stamp}`;

const webinarToDelete = {
  title: `Черновой вебинар ${stamp}`,
  description: "Проверочный эфир для сценария удаления вебинара.",
  url: "https://vkvideo.ru/video-1_456239999"
};

const homework = {
  title: `Домашка ${stamp}`,
  course: "11 класс · Основной поток",
  instructions: "Реши все задания, подпиши ответы и приложи ход рассуждений."
};

const studentAnswer = `Ответ ученика ${stamp}: расписываю решение, формулы и итоговый вывод по заданию.`;

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

async function expectInputValue(locator, expectedText) {
  await locator.waitFor({ state: "visible", timeout: 15000 });

  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    const value = await locator.inputValue();

    if (value.includes(expectedText)) {
      return;
    }

    await locator.page().waitForTimeout(250);
  }

  const finalValue = await locator.inputValue();
  assert(finalValue.includes(expectedText), `Expected value "${expectedText}" in "${finalValue}"`);
}

async function expectNoText(locator, text) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    const content = await locator.innerText();

    if (!content.includes(text)) {
      return;
    }

    await locator.page().waitForTimeout(250);
  }

  const finalText = await locator.innerText();
  assert(!finalText.includes(text), `Did not expect text "${text}" in "${finalText}"`);
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

async function openTeacherSection(page, path) {
  await Promise.all([
    expectUrl(page, path),
    page.locator(`.sidebar__nav a[href='${path}']`).click()
  ]);
}

async function createWebinar(page, details) {
  await page.fill("#webinar-title", details.title);
  await page.selectOption("#webinar-subject", "Химия");
  await page.selectOption("#webinar-type", details.url.includes("youtube") ? "youtube" : "vk");
  await page.fill("#webinar-date", formatLocalDateTime(24));
  await page.fill("#webinar-url", details.url);
  await page.fill("#webinar-description", details.description);
  await page.locator("#webinar-form button[type='submit']").click();
  await expectText(page.locator("#webinar-form-note"), "Вебинар сохранён");
  await expectText(page.locator("#teacher-webinars"), details.title);
  await page.locator("#teacher-webinars .webinar-showcase-card").first().waitFor({ state: "visible", timeout: 15000 });
}

async function deleteWebinar(page, title) {
  const card = page.locator(".webinar-showcase-card", { has: page.locator("h3", { hasText: title }) }).first();

  page.once("dialog", (dialog) => dialog.accept());
  await card.locator("[data-delete-webinar]").click();
  await expectText(page.locator("#webinar-form-note"), "Вебинар удалён");
  await expectNoText(page.locator("#teacher-webinars"), title);
}

async function openTeacherWebinar(page, title) {
  const card = page.locator(".webinar-showcase-card", { has: page.locator("h3", { hasText: title }) }).first();

  await Promise.all([
    expectUrl(page, "/teacher/webinars/view/"),
    card.locator(".showcase-link").click()
  ]);

  await expectText(page.locator("#teacher-webinar-title"), title);
  const playerCount = await page.locator("#teacher-webinar-player iframe").count();
  assert(playerCount > 0, "Expected webinar iframe on teacher webinar page");
}

async function editWebinarDesign(page) {
  await page.fill("#webinar-design-title", editedWebinarTitle);
  await page.locator("#webinar-design-image").setInputFiles([
    {
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=",
        "base64"
      )
    }
  ]);
  await page.locator("#webinar-design-form button[type='submit']").click();
  await expectText(page.locator("#webinar-design-form-note"), "Оформление вебинара обновлено");
  await expectText(page.locator("#teacher-webinar-title"), editedWebinarTitle);
  const previewImages = await page.locator("#webinar-design-preview img").count();
  assert(previewImages > 0, "Expected webinar cover image in design preview");
}

async function createHomeworkInsideWebinar(page) {
  await page.selectOption("#webinar-homework-subject", "Химия");
  await page.fill("#webinar-homework-title", homework.title);
  await page.fill("#webinar-homework-deadline", formatLocalDateTime(48));
  await page.fill("#webinar-homework-course", homework.course);
  await page.fill("#webinar-homework-instructions", homework.instructions);
  await page.locator("#webinar-homework-images").setInputFiles([
    {
      name: "scheme.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=",
        "base64"
      )
    }
  ]);
  await page.locator("#webinar-homework-form button[type='submit']").click();
  await expectText(page.locator("#webinar-homework-form-note"), "Домашнее задание добавлено");
  await expectText(page.locator("#teacher-webinar-homeworks"), homework.title);
}

async function logout(page, buttonSelector) {
  await page.locator(buttonSelector).click();
  await expectUrl(page, "/login/");
}

async function verifyStudentSeesContent(page) {
  await login(page, student.email, student.password);
  await expectUrl(page, "/student/dashboard/");
  await expectText(page.locator("#timeline"), editedWebinarTitle);
  await expectText(page.locator("#video-library"), editedWebinarTitle);
  const webinarPlayers = await page.locator("#timeline iframe").count();
  assert(webinarPlayers > 0, "Expected embedded webinar player in student timeline");
  await Promise.all([
    expectUrl(page, "/student/webinars/"),
    page.locator(".sidebar__nav a[href='/student/webinars/']").click()
  ]);
  await expectText(page.locator("#student-webinars-grid"), editedWebinarTitle);
  const card = page.locator(".webinar-showcase-card", { has: page.locator("h3", { hasText: editedWebinarTitle }) }).first();
  const catalogCoverImages = await page.locator("#student-webinars-grid img").count();
  assert(catalogCoverImages > 0, "Expected uploaded webinar cover image in student catalog");
  await Promise.all([
    expectUrl(page, "/student/webinars/view/"),
    card.locator(".showcase-link").click()
  ]);
  await expectText(page.locator("#student-webinar-title"), editedWebinarTitle);
  await expectText(page.locator("#student-webinar-homeworks"), homework.title);
  const detailPlayerCount = await page.locator("#student-webinar-player iframe").count();
  assert(detailPlayerCount > 0, "Expected embedded webinar player on student webinar page");
  const imageCount = await page.locator("#student-webinar-homeworks img").count();
  assert(imageCount > 0, "Expected at least one homework image in student dashboard");

  const homeworkCard = page.locator(".homework-card", { has: page.locator("h3", { hasText: homework.title }) }).first();
  await Promise.all([
    expectUrl(page, "/student/homeworks/view/"),
    homeworkCard.locator(".surface-link", { hasText: "Открыть ДЗ" }).click()
  ]);

  await expectText(page.locator("#student-homework-title"), homework.title);
  await page.fill("#student-homework-answer", studentAnswer);
  await page.locator("#student-homework-submit-answer").click();
  await expectText(page.locator("#student-homework-answer-note"), "Ответ отправлен");
  await expectText(page.locator("#student-homework-status"), "Ответ отправлен");
  await page.reload({ waitUntil: "networkidle" });
  await expectInputValue(page.locator("#student-homework-answer"), studentAnswer);
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
    await expectText(page.locator("#teacher-overview-students"), student.fullName);

    await openTeacherSection(page, "/teacher/students/");
    await expectText(page.locator("#teacher-students"), student.fullName);

    await openTeacherSection(page, "/teacher/webinars/");
    await createWebinar(page, webinarToDelete);
    await deleteWebinar(page, webinarToDelete.title);
    await createWebinar(page, webinar);
    await openTeacherWebinar(page, webinar.title);
    await editWebinarDesign(page);
    await createHomeworkInsideWebinar(page);

    await logout(page, ".logout-button");
    await verifyStudentSeesContent(page);

    console.log(
      JSON.stringify(
        {
          ok: true,
          studentEmail: student.email,
          teacherEmail: teacher.email,
          webinarTitle: editedWebinarTitle,
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

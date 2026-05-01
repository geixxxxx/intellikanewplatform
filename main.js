const authState = {
  mode: "login",
  role: new URLSearchParams(window.location.search).get("role") === "teacher" ? "teacher" : "student",
  homeworkPreviewUrls: []
};

const revealSelector = [
  ".landing-nav",
  ".landing-hero",
  ".landing-stat-card",
  ".landing-feature",
  ".landing-split",
  ".landing-cta",
  ".preview-card",
  ".landing-mini-card",
  ".auth-card",
  ".topbar",
  ".hero-card",
  ".metric-card",
  ".section-card",
  ".section-block",
  ".subject-card",
  ".timeline-card",
  ".video-card",
  ".homework-card",
  ".feed-card",
  ".teacher-item",
  ".student-card"
].join(", ");

let revealObserver;

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (symbol) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[symbol];
  });

const formatDateTime = (value) => {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const formatHeroDateTime = (value) => {
  if (!value) {
    return "Скоро";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
};

const normalizeSubject = (value) =>
  String(value)
    .toLowerCase()
    .replace("профильная ", "")
    .trim();

const matchesFilter = (subjectName, activeFilter) =>
  activeFilter === "Все" || normalizeSubject(subjectName) === normalizeSubject(activeFilter);

const getSourceTypeLabel = (type) =>
  ({
    live: "Прямой эфир",
    youtube: "YouTube",
    vk: "VK Video"
  })[type] || "Видео";

const getHomeworkStatus = (deadline) => {
  const parsed = new Date(deadline);

  if (Number.isNaN(parsed.getTime())) {
    return { key: "review", label: "Нужна проверка" };
  }

  const delta = parsed.getTime() - Date.now();

  if (delta <= 1000 * 60 * 60 * 24) {
    return { key: "urgent", label: "Сгорает скоро" };
  }

  if (delta <= 1000 * 60 * 60 * 48) {
    return { key: "review", label: "Нужен фокус" };
  }

  return { key: "done", label: "Можно планировать" };
};

const renderEmptyState = (title, text) => `
  <div class="empty-state">
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(text)}</span>
  </div>
`;

const ensureRevealObserver = () => {
  if (revealObserver || typeof window === "undefined") {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealObserver = {
      observe(element) {
        element.classList.add("is-visible");
      }
    };
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px"
    }
  );
};

const setupRevealMotion = () => {
  ensureRevealObserver();

  [...document.querySelectorAll(revealSelector)]
    .filter((element) => !element.dataset.revealBound)
    .forEach((element, index) => {
      element.dataset.revealBound = "true";
      element.setAttribute("data-reveal", "");
      element.style.setProperty("--reveal-order", String(index % 8));
      revealObserver.observe(element);
    });
};

const setProgressRing = (element, progress) => {
  if (!element) {
    return;
  }

  element.style.background = `conic-gradient(#fff 0deg ${Math.max(0, Math.min(progress, 100)) * 3.6}deg, rgba(255, 255, 255, 0.2) ${Math.max(0, Math.min(progress, 100)) * 3.6}deg 360deg)`;
};

const setBanner = (wrapper, textNode, kind, text) => {
  if (!wrapper || !textNode) {
    return;
  }

  wrapper.dataset.kind = kind;
  textNode.textContent = text;
};

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const error = new Error(payload.message || "Ошибка запроса.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const redirectByRole = (role) => {
  window.location.href = role === "teacher" ? "/teacher/dashboard/" : "/student/dashboard/";
};

const logout = async () => {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
    window.location.href = "/login/";
  } catch (error) {
    window.location.href = "/logout";
  }
};

const fetchCurrentUser = async () => {
  try {
    const payload = await apiRequest("/api/auth/me");
    return payload.user;
  } catch (error) {
    if (error.status === 401) {
      return null;
    }

    throw error;
  }
};

const renderFilterPills = (container, labels, activeFilter, onSelect) => {
  container.innerHTML = labels
    .map(
      (label) => `
        <button
          class="filter-pill ${label === activeFilter ? "filter-pill--active" : ""}"
          data-filter="${escapeHtml(label)}"
          type="button"
        >
          ${escapeHtml(label)}
        </button>
      `
    )
    .join("");

  container.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.filter));
  });
};

const renderLanding = async () => {
  const payload = await apiRequest("/api/platform/summary");
  const studentsCount = document.getElementById("landing-students-count");
  const webinarsCount = document.getElementById("landing-webinars-count");
  const homeworksCount = document.getElementById("landing-homeworks-count");
  const statsContainer = document.getElementById("landing-stats");
  const webinarsPreview = document.getElementById("landing-preview-webinars");
  const homeworksPreview = document.getElementById("landing-preview-homeworks");

  studentsCount.textContent = String(payload.counts.students);
  webinarsCount.textContent = String(payload.counts.webinars);
  homeworksCount.textContent = String(payload.counts.homeworks);

  statsContainer.innerHTML = [
    {
      value: payload.counts.students,
      label: "зарегистрированных учеников",
      caption: "Все пользователи хранятся в PostgreSQL и доступны в кабинете преподавателя."
    },
    {
      value: payload.counts.webinars,
      label: "вебинаров и видеозаписей",
      caption: "YouTube, VK Video и эфиры объединены в одной базе."
    },
    {
      value: payload.counts.homeworks,
      label: "домашних заданий",
      caption: "Домашки, дедлайны и изображения привязаны к платформе и курсам."
    },
    {
      value: payload.counts.announcements,
      label: "обновлений платформы",
      caption: "Системные и преподавательские анонсы также приходят из базы."
    }
  ]
    .map(
      (item) => `
        <article class="landing-stat-card">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
          <p>${escapeHtml(item.caption)}</p>
        </article>
      `
    )
    .join("");

  webinarsPreview.innerHTML = payload.webinars.length
    ? payload.webinars
        .map(
          (item) => `
            <article class="preview-card">
              <div class="preview-card__header">
                <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                <strong>${escapeHtml(formatDateTime(item.scheduled_at || item.scheduledAt))}</strong>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(`${item.subject} · ${item.teacher_name || item.teacher}`)}</p>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока нет вебинаров", "Первый преподавательский эфир появится здесь автоматически.");

  homeworksPreview.innerHTML = payload.homeworks.length
    ? payload.homeworks
        .map(
          (item) => `
            <article class="preview-card preview-card--image">
              ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" />` : ""}
              <div>
                <span class="timeline-pill">${escapeHtml(item.subject)}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.instructions)}</p>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока нет домашних заданий", "После публикации первой домашки превью появится здесь.");

  setupRevealMotion();
};

const initLoginPage = async () => {
  const currentUser = await fetchCurrentUser();

  if (currentUser) {
    // Show the user they're already logged in with options to go to their dashboard or log out
    const form = document.getElementById("login-form");
    const heading = document.getElementById("login-heading");
    const copy = document.getElementById("login-copy");
    const statusWrapper = document.getElementById("auth-status");
    const note = document.getElementById("auth-note-text");
    const authModeSwitch = document.getElementById("auth-mode-switch");
    const roleSwitch = document.getElementById("role-switch");

    authModeSwitch.hidden = true;
    roleSwitch.hidden = true;
    form.hidden = true;

    heading.textContent = `Привет, ${currentUser.fullName}!`;
    copy.textContent = "Ты уже вошёл в платформу. Выбери, куда хочешь перейти.";

    setBanner(statusWrapper, note, "info", `Роль: ${currentUser.role === "teacher" ? "Преподаватель" : "Ученик"}`);

    const actions = document.createElement("div");
    actions.className = "hero-card__actions";
    actions.style.marginTop = "1.5rem";
    actions.innerHTML = `
      <a class="primary-action primary-action--inline" href="${currentUser.role === "teacher" ? "/teacher/dashboard/" : "/student/dashboard/"}">
        Открыть мой кабинет
      </a>
      <button class="ghost-action" id="already-logged-in-logout" type="button">
        Выйти из аккаунта
      </button>
    `;
    copy.after(actions);

    document.getElementById("already-logged-in-logout").addEventListener("click", async () => {
      await logout();
    });

    return;
  }

  const authModeSwitch = document.getElementById("auth-mode-switch");
  const roleSwitch = document.getElementById("role-switch");
  const heading = document.getElementById("login-heading");
  const copy = document.getElementById("login-copy");
  const note = document.getElementById("auth-note-text");
  const continueButton = document.getElementById("continue-button");
  const form = document.getElementById("login-form");
  const statusWrapper = document.getElementById("auth-status");
  const fullNameField = document.getElementById("full-name-field");
  const studentExtraFields = document.getElementById("student-extra-fields");
  const emailInput = document.getElementById("email-input");
  const passwordInput = document.getElementById("password-input");
  const fullNameInput = document.getElementById("full-name-input");
  const gradeInput = document.getElementById("grade-input");
  const examYearInput = document.getElementById("exam-year-input");

  const config = {
    login: {
      student: {
        heading: "Вход для ученика",
        copy: "Войди по email и паролю, чтобы открыть свой учебный кабинет.",
        note: "После входа будут доступны курсы, вебинары, видеотека и домашние задания.",
        button: "Войти как ученик"
      },
      teacher: {
        heading: "Вход для преподавателя",
        copy: "Войди по email и паролю, чтобы управлять учениками, вебинарами и домашками.",
        note: "Кабинет преподавателя привязан к платформе и работает через PostgreSQL.",
        button: "Войти как преподаватель"
      }
    },
    register: {
      student: {
        heading: "Регистрация ученика",
        copy: "Создай аккаунт ученика, чтобы получить личный кабинет и доступ к курсам.",
        note: "После регистрации курсы будут привязаны к твоему профилю, а вход будет работать через базу данных.",
        button: "Создать аккаунт ученика"
      },
      teacher: {
        heading: "Регистрация преподавателя",
        copy: "Создай аккаунт преподавателя, чтобы публиковать вебинары и управлять платформой.",
        note: "После регистрации откроется кабинет преподавателя с живой базой учеников.",
        button: "Создать аккаунт преподавателя"
      }
    }
  };

  const applyState = () => {
    const current = config[authState.mode][authState.role];

    heading.textContent = current.heading;
    copy.textContent = current.copy;
    note.textContent = current.note;
    continueButton.textContent = current.button;

    authModeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("role-switch__tab--active", button.dataset.mode === authState.mode);
    });

    roleSwitch.querySelectorAll("[data-role]").forEach((button) => {
      button.classList.toggle("role-switch__tab--active", button.dataset.role === authState.role);
    });

    fullNameField.hidden = authState.mode !== "register";
    studentExtraFields.hidden = !(authState.mode === "register" && authState.role === "student");
    emailInput.autocomplete = authState.mode === "login" ? "email" : "email";
    passwordInput.autocomplete = authState.mode === "login" ? "current-password" : "new-password";
    emailInput.placeholder = authState.role === "teacher" ? "mentor@school.ru" : "ivan@school.ru";

    setBanner(statusWrapper, note, "info", current.note);
  };

  authModeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      authState.mode = button.dataset.mode;
      applyState();
    });
  });

  roleSwitch.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      authState.role = button.dataset.role;
      applyState();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    continueButton.disabled = true;

    try {
      if (authState.mode === "register") {
        const payload = await apiRequest("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            role: authState.role,
            fullName: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
            grade: authState.role === "student" ? gradeInput.value : "",
            examYear: authState.role === "student" ? examYearInput.value : ""
          })
        });

        window.location.href = payload.redirectTo;
        return;
      }

      const payload = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value
        })
      });

      window.location.href = payload.redirectTo;
    } catch (error) {
      setBanner(statusWrapper, note, "error", error.message);
      continueButton.disabled = false;
    }
  });

  applyState();
};

const renderStudentCourses = (container, courses, activeFilter) => {
  const filtered = courses.filter((course) => matchesFilter(course.subject, activeFilter));

  container.innerHTML = filtered.length
    ? filtered
        .map(
          (course) => `
            <article class="subject-card">
              <p>${escapeHtml(course.subject)}</p>
              <h3>${escapeHtml(course.name)}</h3>
              <div class="subject-card__meta">
                <span>${escapeHtml(course.mentor)}</span>
                <strong>${escapeHtml(`${course.score}/100`)}</strong>
              </div>
              <div class="subject-card__progress"><span style="width: ${course.progress}%"></span></div>
              <div class="subject-card__meta">
                <span>${escapeHtml(course.nextTopic)}</span>
                <strong>${escapeHtml(`${course.progress}%`)}</strong>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Нет курсов по фильтру", "Выбери другой предмет или дождись новых курсов.");
};

const renderStudentTimeline = (container, webinars, activeFilter) => {
  const filtered = webinars.filter((item) => matchesFilter(item.subject, activeFilter));

  container.innerHTML = filtered.length
    ? filtered
        .map(
          (item) => `
            <article class="timeline-card">
              <strong class="timeline-time">${escapeHtml(formatHeroDateTime(item.scheduledAt))}</strong>
              <div>
                <p>${escapeHtml(item.subject)}</p>
                <h3>${escapeHtml(item.title)}</h3>
                <span>${escapeHtml(item.teacher)}</span>
              </div>
              <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Вебинаров пока нет", "Как только преподаватель опубликует занятие, оно появится здесь.");
};

const renderVideoLibrary = (container, webinars, activeFilter) => {
  const filtered = webinars.filter(
    (item) => item.type !== "live" && matchesFilter(item.subject, activeFilter)
  );

  container.innerHTML = filtered.length
    ? filtered
        .map((item) => {
          const frame = item.embedUrl
            ? `<iframe src="${item.embedUrl}" title="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
            : `<div class="video-placeholder"><strong>${escapeHtml(item.sourceTypeLabel)}</strong><span>Ссылка сохранена, но embed недоступен.</span></div>`;

          return `
            <article class="video-card">
              <div class="video-card__frame">${frame}</div>
              <div class="video-card__body">
                <div class="video-card__meta">
                  <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                  <strong>${escapeHtml(item.subject)}</strong>
                </div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.description)}</p>
                <div class="video-card__footer">
                  <span>${escapeHtml(item.teacher)}</span>
                  ${
                    item.sourceUrl
                      ? `<a class="surface-link surface-link--small" href="${item.sourceUrl}" target="_blank" rel="noreferrer">Открыть источник</a>`
                      : ""
                  }
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Записей пока нет", "После публикации роликов из YouTube или VK Video они появятся здесь.");
};

const renderStudentHomeworks = (container, homeworks, activeFilter) => {
  const filtered = homeworks.filter((item) => matchesFilter(item.subject, activeFilter));

  container.innerHTML = filtered.length
    ? filtered
        .map((item) => {
          const status = getHomeworkStatus(item.deadline);
          const gallery = item.images.length
            ? `
              <div class="homework-gallery">
                ${item.images
                  .map(
                    (image, index) => `
                      <img src="${image}" alt="${escapeHtml(`${item.title} · изображение ${index + 1}`)}" loading="lazy" />
                    `
                  )
                  .join("")}
              </div>
            `
            : "";

          return `
            <article class="homework-card">
              <div class="homework-card__row">
                <p>${escapeHtml(item.subject)}</p>
                <span class="status-pill status-pill--${escapeHtml(status.key)}">${escapeHtml(status.label)}</span>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <span>${escapeHtml(item.instructions)}</span>
              ${gallery}
              <div class="homework-card__row">
                <span>${escapeHtml(formatDateTime(item.deadline))}</span>
                <strong>${escapeHtml(item.courseLabel)}</strong>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Домашек пока нет", "Когда преподаватель создаст домашние задания, они появятся здесь.");
};

const renderStudentAnalytics = (container, courses) => {
  container.innerHTML = courses.length
    ? courses
        .map(
          (course) => `
            <div class="bar-item">
              <div class="bar-label">
                <strong>${escapeHtml(course.name)}</strong>
                <span>${escapeHtml(`${course.score}/100`)}</span>
              </div>
              <div class="bar-track">
                <span style="width: ${course.progress}%"></span>
              </div>
            </div>
          `
        )
        .join("")
    : renderEmptyState("Аналитика появится позже", "Курсы и активность ученика сформируют метрики автоматически.");
};

const renderFeed = (container, announcements) => {
  container.innerHTML = announcements.length
    ? announcements
        .map(
          (item) => `
            <article class="feed-card">
              <div class="feed-card__header">
                <div class="feed-card__avatar">${escapeHtml(item.initials)}</div>
                <div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <span>${escapeHtml(item.meta)}</span>
                </div>
              </div>
              <p>Обновление</p>
              <div class="feed-card__meta">
                <span>${escapeHtml(item.text)}</span>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока нет обновлений", "Лента платформы наполнится после первых действий преподавателей.");
};

const initStudentDashboard = async () => {
  let payload;

  try {
    payload = await apiRequest("/api/student/dashboard");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/login/?role=student";
      return;
    }

    throw error;
  }

  const name = document.getElementById("student-name");
  const initials = document.getElementById("student-initials");
  const meta = document.getElementById("student-meta");
  const heroTitle = document.getElementById("student-hero-title");
  const heroCopy = document.getElementById("student-hero-copy");
  const progressRing = document.getElementById("student-progress-ring");
  const progressValue = document.getElementById("student-progress-value");
  const nextTime = document.getElementById("next-webinar-time");
  const nextTitle = document.getElementById("next-webinar-title");
  const lives = document.getElementById("student-lives");
  const streak = document.getElementById("student-streak");
  const solved = document.getElementById("student-solved");
  const score = document.getElementById("student-score");
  const pills = document.getElementById("subject-pills");
  const courses = document.getElementById("subjects-grid");
  const timeline = document.getElementById("timeline");
  const library = document.getElementById("video-library");
  const homeworks = document.getElementById("homework-list");
  const bars = document.getElementById("progress-bars");
  const feed = document.getElementById("community-feed");
  const logoutButton = document.getElementById("student-logout-button");

  name.textContent = payload.user.fullName;
  initials.textContent = payload.user.initials;
  meta.textContent = `${payload.user.grade}${payload.user.examYear ? ` · ЕГЭ ${payload.user.examYear}` : ""}`;
  progressValue.textContent = `${payload.profile.overallProgress}%`;
  setProgressRing(progressRing, payload.profile.overallProgress);
  lives.textContent = String(payload.profile.lives);
  streak.textContent = `${payload.profile.streakDays} дней`;
  solved.textContent = String(payload.profile.solvedTasks);
  score.textContent = `${payload.profile.predictedScore || 0}+`;

  const nextWebinar = payload.webinars[0];
  heroTitle.textContent = nextWebinar
    ? `${payload.user.fullName}, следующий шаг — не пропустить ближайший вебинар и держать темп курса.`
    : `${payload.user.fullName}, твой кабинет готов. Осталось дождаться первых вебинаров и домашних заданий.`;
  heroCopy.textContent = nextWebinar
    ? "Все важное уже связано через платформу: курсы, расписание, видео, домашки и обновления преподавателей."
    : "Платформа уже привязана к твоему аккаунту. Как только преподаватели опубликуют материалы, они появятся здесь автоматически.";

  if (nextWebinar) {
    nextTime.textContent = `${formatHeroDateTime(nextWebinar.scheduledAt)} · ${nextWebinar.subject}`;
    nextTitle.textContent = nextWebinar.title;
  } else {
    nextTime.textContent = "Вебинаров пока нет";
    nextTitle.textContent = "Преподаватели ещё не добавили новые занятия.";
  }

  let activeFilter = "Все";
  const subjects = ["Все", ...payload.courses.map((course) => course.subject)];
  const uniqueSubjects = [...new Set(subjects)];

  const render = () => {
    renderFilterPills(pills, uniqueSubjects, activeFilter, (nextFilter) => {
      activeFilter = nextFilter;
      render();
    });
    renderStudentCourses(courses, payload.courses, activeFilter);
    renderStudentTimeline(timeline, payload.webinars, activeFilter);
    renderVideoLibrary(library, payload.webinars, activeFilter);
    renderStudentHomeworks(homeworks, payload.homeworks, activeFilter);
    renderStudentAnalytics(bars, payload.courses);
    renderFeed(feed, payload.announcements);
    setupRevealMotion();
  };

  render();

  logoutButton.addEventListener("click", async (event) => {
    event.preventDefault();
    logoutButton.textContent = "Выходим...";
    logoutButton.style.pointerEvents = "none";
    await logout();
  });
};

const renderTeacherStudents = (container, students) => {
  container.innerHTML = students.length
    ? students
        .map(
          (student) => `
            <article class="student-card">
              <div class="student-card__header">
                <div class="feed-card__avatar">${escapeHtml(student.initials)}</div>
                <div>
                  <h3>${escapeHtml(student.fullName)}</h3>
                  <span>${escapeHtml(student.email)}</span>
                </div>
              </div>
              <div class="chip-row">
                <span class="chip">${escapeHtml(student.grade)}</span>
                <span class="chip">${student.examYear ? `ЕГЭ ${escapeHtml(student.examYear)}` : "Экзамен не указан"}</span>
                <span class="chip">${escapeHtml(`${student.predictedScore || 0}+ баллов`)}</span>
              </div>
              <p>${escapeHtml(student.courses || "Курсы будут привязаны после регистрации")}</p>
              <div class="student-card__footer">
                <span>${escapeHtml(`Аккаунт создан: ${student.lastSeen}`)}</span>
                <strong>${escapeHtml(`${student.overallProgress || 0}% прогресса`)}</strong>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока нет учеников", "После регистрации ученики автоматически появятся в этой базе.");
};

const renderTeacherWebinars = (container, webinars) => {
  container.innerHTML = webinars.length
    ? webinars
        .map(
          (item) => `
            <article class="teacher-item">
              <div class="teacher-item__header">
                <div>
                  <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                </div>
                <strong>${escapeHtml(item.subject)}</strong>
              </div>
              <p>${escapeHtml(item.description)}</p>
              <div class="teacher-item__footer">
                <span>${escapeHtml(`${formatDateTime(item.scheduledAt)} · ${item.teacher}`)}</span>
                ${
                  item.sourceUrl
                    ? `<a class="surface-link surface-link--small" href="${item.sourceUrl}" target="_blank" rel="noreferrer">Ссылка</a>`
                    : `<span>Без внешней ссылки</span>`
                }
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока нет вебинаров", "Первый эфир или видеоурок, созданный преподавателем, появится здесь.");
};

const renderTeacherHomeworks = (container, homeworks) => {
  container.innerHTML = homeworks.length
    ? homeworks
        .map((item) => {
          const status = getHomeworkStatus(item.deadline);

          return `
            <article class="teacher-item">
              <div class="teacher-item__header">
                <div>
                  <span class="timeline-pill">${escapeHtml(item.subject)}</span>
                  <h3>${escapeHtml(item.title)}</h3>
                </div>
                <span class="status-pill status-pill--${escapeHtml(status.key)}">${escapeHtml(status.label)}</span>
              </div>
              <p>${escapeHtml(item.instructions)}</p>
              ${
                item.images.length
                  ? `
                    <div class="upload-preview upload-preview--inline">
                      ${item.images
                        .map(
                          (image, index) => `
                            <img src="${image}" alt="${escapeHtml(`${item.title} preview ${index + 1}`)}" loading="lazy" />
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
              <div class="teacher-item__footer">
                <span>${escapeHtml(`${formatDateTime(item.deadline)} · ${item.courseLabel}`)}</span>
                <strong>${escapeHtml(`${item.images.length} изображений`)}</strong>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Пока нет домашних заданий", "Создай первое задание, и оно сразу появится у учеников.");
};

const renderHomeworkPreview = (container, files) => {
  authState.homeworkPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  authState.homeworkPreviewUrls = [];

  if (!files.length) {
    container.innerHTML = renderEmptyState(
      "Пока без изображений",
      "После выбора файлов здесь появятся превью для будущего задания."
    );
    return;
  }

  authState.homeworkPreviewUrls = files.map((file) => URL.createObjectURL(file));
  container.innerHTML = authState.homeworkPreviewUrls
    .map(
      (url, index) => `
        <img src="${url}" alt="${escapeHtml(`Изображение ${index + 1}`)}" loading="lazy" />
      `
    )
    .join("");
};

const initTeacherDashboard = async () => {
  const teacherName = document.getElementById("teacher-name");
  const teacherInitials = document.getElementById("teacher-initials");
  const studentsCount = document.getElementById("teacher-students-count");
  const assetsCount = document.getElementById("teacher-assets-count");
  const liveCount = document.getElementById("teacher-webinars-count");
  const videosCount = document.getElementById("teacher-videos-count");
  const homeworksCount = document.getElementById("teacher-homeworks-count");
  const imagesCount = document.getElementById("teacher-homeworks-images-count");
  const students = document.getElementById("teacher-students");
  const webinars = document.getElementById("teacher-webinars");
  const homeworks = document.getElementById("teacher-homeworks");
  const webinarForm = document.getElementById("webinar-form");
  const homeworkForm = document.getElementById("homework-form");
  const webinarFormNote = document.getElementById("webinar-form-note");
  const homeworkFormNote = document.getElementById("homework-form-note");
  const webinarTeacherInput = document.getElementById("webinar-teacher");
  const preview = document.getElementById("homework-image-preview");
  const imagesInput = document.getElementById("homework-images");
  const logoutButton = document.getElementById("teacher-logout-button");

  const loadTeacherDashboard = async () => {
    let payload;

    try {
      payload = await apiRequest("/api/teacher/dashboard");
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "/login/?role=teacher";
        return null;
      }

      throw error;
    }

    teacherName.textContent = payload.user.fullName;
    teacherInitials.textContent = payload.user.initials;
    webinarTeacherInput.value = payload.user.fullName;
    webinarTeacherInput.readOnly = true;
    studentsCount.textContent = String(payload.counts.students);
    assetsCount.textContent = String(payload.counts.assets);
    liveCount.textContent = String(payload.counts.liveWebinars);
    videosCount.textContent = String(payload.counts.videos);
    homeworksCount.textContent = String(payload.counts.homeworks);
    imagesCount.textContent = String(payload.counts.homeworkImages);

    renderTeacherStudents(students, payload.students);
    renderTeacherWebinars(webinars, payload.webinars);
    renderTeacherHomeworks(homeworks, payload.homeworks);
    setupRevealMotion();

    return payload;
  };

  await loadTeacherDashboard();
  renderHomeworkPreview(preview, []);

  webinarForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = webinarForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await apiRequest("/api/teacher/webinars", {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("webinar-title").value.trim(),
          subject: document.getElementById("webinar-subject").value,
          type: document.getElementById("webinar-type").value,
          scheduledAt: document.getElementById("webinar-date").value,
          sourceUrl: document.getElementById("webinar-url").value.trim(),
          description: document.getElementById("webinar-description").value.trim()
        })
      });

      webinarForm.reset();
      webinarTeacherInput.value = teacherName.textContent;
      webinarTeacherInput.readOnly = true;
      webinarFormNote.dataset.kind = "success";
      webinarFormNote.textContent = "Вебинар сохранён и уже доступен на платформе.";
      await loadTeacherDashboard();
    } catch (error) {
      webinarFormNote.dataset.kind = "error";
      webinarFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  imagesInput.addEventListener("change", () => {
    renderHomeworkPreview(preview, [...imagesInput.files]);
  });

  homeworkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = homeworkForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const formData = new FormData();
      formData.set("subject", document.getElementById("homework-subject").value);
      formData.set("title", document.getElementById("homework-title").value.trim());
      formData.set("deadline", document.getElementById("homework-deadline").value);
      formData.set("courseLabel", document.getElementById("homework-course").value.trim());
      formData.set("instructions", document.getElementById("homework-instructions").value.trim());
      [...imagesInput.files].forEach((file) => formData.append("images", file));

      await apiRequest("/api/teacher/homeworks", {
        method: "POST",
        body: formData
      });

      homeworkForm.reset();
      renderHomeworkPreview(preview, []);
      homeworkFormNote.dataset.kind = "success";
      homeworkFormNote.textContent = "Домашнее задание сохранено и доступно ученикам.";
      await loadTeacherDashboard();
    } catch (error) {
      homeworkFormNote.dataset.kind = "error";
      homeworkFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async (event) => {
    event.preventDefault();
    logoutButton.textContent = "Выходим...";
    logoutButton.style.pointerEvents = "none";
    await logout();
  });
};

const page = document.body.dataset.page;

setupRevealMotion();

if (page === "landing") {
  renderLanding().catch((error) => {
    console.error(error);
  });
}

if (page === "login") {
  initLoginPage().catch((error) => {
    console.error(error);
  });
}

if (page === "student-dashboard") {
  initStudentDashboard().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-dashboard") {
  initTeacherDashboard().catch((error) => {
    console.error(error);
  });
}
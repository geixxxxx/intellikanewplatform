const authState = {
  mode: "login",
  role: new URLSearchParams(window.location.search).get("role") === "teacher" ? "teacher" : "student",
  homeworkPreviewUrls: [],
  webinarCoverPreviewUrl: ""
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
  ".quick-link-card",
  ".section-card",
  ".section-block",
  ".subject-card",
  ".webinar-showcase-card",
  ".webinar-stage",
  ".webinar-mini-card",
  ".homework-mini-card",
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

const renderWebinarPlayer = (item, variant = "default") => {
  if (item.embedUrl) {
    return `
      <div class="webinar-player webinar-player--${variant}">
        <iframe
          src="${escapeHtml(item.embedUrl)}"
          title="${escapeHtml(item.title)}"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }

  const fallbackText = item.sourceUrl
    ? "Ссылка сохранена. Если источник не поддерживает встроенный просмотр, открой вебинар по кнопке ниже."
    : "Преподаватель пока не добавил ссылку для встроенного просмотра этого вебинара.";

  return `
    <div class="webinar-player webinar-player--${variant}">
      <div class="video-placeholder video-placeholder--webinar">
        <strong>${escapeHtml(item.sourceTypeLabel)}</strong>
        <span>${escapeHtml(fallbackText)}</span>
      </div>
    </div>
  `;
};

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

const getQueryParam = (name) => new URLSearchParams(window.location.search).get(name) || "";

const buildWebinarDetailHref = (role, webinarId) =>
  `${role === "teacher" ? "/teacher/webinars/view/" : "/student/webinars/view/"}?id=${encodeURIComponent(webinarId)}`;

const buildHomeworkDetailHref = (homeworkId) =>
  `/student/homeworks/view/?id=${encodeURIComponent(homeworkId)}`;

const getWebinarTheme = (subject) => {
  const normalized = normalizeSubject(subject);

  if (normalized.includes("хим")) {
    return "ember";
  }

  if (normalized.includes("русский")) {
    return "sun";
  }

  if (normalized.includes("математик")) {
    return "cosmos";
  }

  return "forest";
};

const getWebinarProgress = (item) => {
  if (item.type === "live") {
    return 72;
  }

  if (item.homeworkCount > 0) {
    return 100;
  }

  return 88;
};

const getHomeworkSubmissionState = (status) => {
  if (status === "submitted") {
    return {
      key: "done",
      label: "Ответ отправлен",
      actionLabel: "Открыть ответ",
      note: "Ответ уже привязан к твоему аккаунту и сохранён в платформе."
    };
  }

  if (status === "draft") {
    return {
      key: "review",
      label: "Черновик сохранён",
      actionLabel: "Продолжить ответ",
      note: "Черновик уже лежит в базе. Можно вернуться позже и дописать решение."
    };
  }

  return {
    key: "urgent",
    label: "Нужен ответ",
    actionLabel: "Открыть ДЗ",
    note: "Открой задание отдельно и введи ответ прямо внутри платформы."
  };
};

const renderWebinarPoster = (item, options = {}) => {
  const theme = getWebinarTheme(item.subject);
  const coverImageUrl = options.coverImageUrl || item.coverImageUrl || "";

  if (coverImageUrl) {
    return `
      <div class="webinar-poster webinar-poster--custom webinar-poster--${escapeHtml(theme)}">
        <img class="webinar-poster__image" src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="webinar-poster__overlay">
          <span class="webinar-poster__brand">100Б</span>
          <div class="webinar-poster__frame">
            <div class="webinar-poster__copy">
              <p>${escapeHtml(item.subject)}</p>
              <h3>${escapeHtml(item.title)}</h3>
              <span>${escapeHtml(item.sourceTypeLabel)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="webinar-poster webinar-poster--${escapeHtml(theme)}">
      <span class="webinar-poster__brand">100Б</span>
      <div class="webinar-poster__frame">
        <div class="webinar-poster__copy">
          <p>${escapeHtml(item.subject)}</p>
          <h3>${escapeHtml(item.title)}</h3>
          <span>${escapeHtml(item.sourceTypeLabel)}</span>
        </div>
      </div>
    </div>
  `;
};

const renderWebinarShowcase = (container, webinars, options = {}) => {
  if (!container) {
    return;
  }

  const role = options.role === "teacher" ? "teacher" : "student";
  const items = webinars.slice(0, options.limit || webinars.length);

  container.innerHTML = items.length
    ? items
        .map((item) => {
          const theme = getWebinarTheme(item.subject);
          const detailHref = buildWebinarDetailHref(role, item.id);

          return `
            <article class="webinar-showcase-card webinar-showcase-card--${escapeHtml(theme)}">
              <div class="webinar-showcase-card__cover">
                <span class="webinar-showcase-card__pin">★</span>
                <span class="webinar-showcase-card__dots">•••</span>
                ${renderWebinarPoster(item)}
                <div class="webinar-showcase-card__chip">
                  <span class="webinar-showcase-card__dot"></span>
                  <span>${escapeHtml(item.subject)}</span>
                </div>
              </div>
              <div class="webinar-showcase-card__body">
                <h3>${escapeHtml(item.title)}</h3>
                <div class="webinar-showcase-card__meta">
                  <span>${escapeHtml(formatDateTime(item.scheduledAt))}</span>
                  <strong>${escapeHtml(`${item.homeworkCount || 0} ДЗ`)}</strong>
                </div>
                <div class="webinar-showcase-card__progress">
                  <span style="width: ${getWebinarProgress(item)}%"></span>
                </div>
              </div>
              <div class="webinar-showcase-card__footer">
                <a class="showcase-link" href="${detailHref}">${role === "teacher" ? "Открыть вебинар" : "Смотреть вебинар"}</a>
                ${
                  options.allowDelete
                    ? `<button class="danger-action danger-action--compact" data-delete-webinar="${escapeHtml(item.id)}" type="button">Удалить</button>`
                    : `<span class="webinar-showcase-card__footer-note">${escapeHtml(item.type === "live" ? "Эфир внутри платформы" : "Запись доступна сразу")}</span>`
                }
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Пока нет вебинаров", "Как только преподаватель опубликует вебинар, он появится в этом каталоге.");
};

const renderWebinarMiniList = (container, webinars, options = {}) => {
  if (!container) {
    return;
  }

  const role = options.role === "teacher" ? "teacher" : "student";
  const items = webinars.slice(0, options.limit || webinars.length);

  container.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="webinar-mini-card">
              <div>
                <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(`${item.subject} · ${formatDateTime(item.scheduledAt)}`)}</p>
              </div>
              <div class="webinar-mini-card__footer">
                <span>${escapeHtml(`${item.homeworkCount || 0} ДЗ`)}</span>
                <a class="surface-link surface-link--small" href="${buildWebinarDetailHref(role, item.id)}">Открыть</a>
              </div>
            </article>
          `
        )
        .join("")
    : renderEmptyState("Пока пусто", "Когда появятся другие вебинары, они будут показаны здесь.");
};

const renderHomeworkMiniList = (container, homeworks, options = {}) => {
  if (!container) {
    return;
  }

  const items = homeworks.slice(0, options.limit || homeworks.length);

  container.innerHTML = items.length
    ? items
        .map((item) => {
          const submission = getHomeworkSubmissionState(item.submissionStatus);

          return `
            <article class="homework-mini-card">
              <div>
                <span class="timeline-pill">${escapeHtml(item.subject)}</span>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(`${item.courseLabel} · ${formatDateTime(item.deadline)}`)}</p>
              </div>
              <div class="webinar-mini-card__footer">
                <span>${escapeHtml(submission.label)}</span>
                <a class="surface-link surface-link--small" href="${buildHomeworkDetailHref(item.id)}">Открыть</a>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Пока пусто", "Когда появятся другие задания, они будут показаны здесь.");
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
            <article class="timeline-card timeline-card--media">
              <div class="timeline-card__media">
                ${renderWebinarPlayer(item, "schedule")}
              </div>
              <div class="timeline-card__body">
                <div class="timeline-card__meta">
                  <strong class="timeline-time">${escapeHtml(formatHeroDateTime(item.scheduledAt))}</strong>
                  <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                </div>
                <div>
                  <p>${escapeHtml(item.subject)}</p>
                  <h3>${escapeHtml(item.title)}</h3>
                  <span>${escapeHtml(item.teacher)}</span>
                </div>
                <p class="timeline-card__description">${escapeHtml(item.description)}</p>
                <div class="timeline-card__footer">
                  <span>${escapeHtml(`Внутри платформы · ${formatDateTime(item.scheduledAt)}`)}</span>
                  <div class="teacher-item__actions">
                    <a class="surface-link surface-link--small" href="${buildWebinarDetailHref("student", item.id)}">Страница вебинара</a>
                    ${
                      item.sourceUrl
                        ? `<a class="surface-link surface-link--small" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Открыть источник</a>`
                        : ""
                    }
                  </div>
                </div>
              </div>
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
          return `
            <article class="video-card">
              <div class="video-card__frame">${renderWebinarPlayer(item, "library")}</div>
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
          const submission = getHomeworkSubmissionState(item.submissionStatus);
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
              ${
                item.webinarTitle
                  ? `<div class="homework-card__webinar">К вебинару: <a href="${buildWebinarDetailHref("student", item.webinarId)}">${escapeHtml(item.webinarTitle)}</a></div>`
                  : ""
              }
              ${gallery}
              <div class="homework-card__row">
                <span>${escapeHtml(formatDateTime(item.deadline))}</span>
                <strong>${escapeHtml(item.courseLabel)}</strong>
              </div>
              <div class="homework-card__row homework-card__row--actions">
                <span class="homework-card__submission homework-card__submission--${escapeHtml(submission.key)}">${escapeHtml(submission.label)}</span>
                <a class="surface-link surface-link--small" href="${buildHomeworkDetailHref(item.id)}">${escapeHtml(submission.actionLabel)}</a>
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

const fetchStudentWorkspace = async () => {
  try {
    return await apiRequest("/api/student/dashboard");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/login/?role=student";
      return null;
    }

    throw error;
  }
};

const fetchStudentHomeworkDetail = async (homeworkId) => {
  try {
    return await apiRequest(`/api/student/homeworks/${encodeURIComponent(homeworkId)}`);
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/login/?role=student";
      return null;
    }

    if (error.status === 404) {
      window.location.href = "/student/dashboard/#homework";
      return null;
    }

    throw error;
  }
};

const hydrateStudentShell = (payload) => {
  setTextIfPresent("student-name", payload.user.fullName);
  setTextIfPresent(
    "student-meta",
    `${payload.user.grade}${payload.user.examYear ? ` · ЕГЭ ${payload.user.examYear}` : ""}`
  );
  setTextIfPresent("student-initials", payload.user.initials);
};

const initStudentDashboard = async () => {
  const payload = await fetchStudentWorkspace();

  if (!payload) {
    return;
  }

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

  hydrateStudentShell(payload);
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
};

const initStudentWebinars = async () => {
  const payload = await fetchStudentWorkspace();

  if (!payload) {
    return;
  }

  hydrateStudentShell(payload);

  const webinarsGrid = document.getElementById("student-webinars-grid");
  const total = payload.webinars.length;
  const withHomeworks = payload.webinars.filter((item) => item.homeworkCount > 0).length;
  const liveCount = payload.webinars.filter((item) => item.type === "live").length;
  const videoCount = payload.webinars.filter((item) => item.type !== "live").length;
  const nextWebinar = payload.webinars[0];

  setTextIfPresent("student-webinars-count", total);
  setTextIfPresent("student-webinars-homeworks-count", withHomeworks);
  setTextIfPresent("student-live-webinars-count", liveCount);
  setTextIfPresent("student-video-webinars-count", videoCount);
  setTextIfPresent("student-nearest-webinar-time", nextWebinar ? formatHeroDateTime(nextWebinar.scheduledAt) : "Скоро");
  setTextIfPresent(
    "student-nearest-webinar-title",
    nextWebinar ? nextWebinar.title : "Материалы появятся после публикации преподавателя"
  );

  renderWebinarShowcase(webinarsGrid, payload.webinars, { role: "student" });
  setupRevealMotion();
};

const initStudentWebinarView = async () => {
  const payload = await fetchStudentWorkspace();

  if (!payload) {
    return;
  }

  hydrateStudentShell(payload);

  const webinarId = getQueryParam("id");
  const webinar = payload.webinars.find((item) => item.id === webinarId);

  if (!webinar) {
    window.location.href = "/student/webinars/";
    return;
  }

  const webinarHomeworks = payload.homeworks.filter((item) => item.webinarId === webinar.id);
  const relatedWebinars = payload.webinars.filter((item) => item.id !== webinar.id).slice(0, 4);
  const sourceLink = document.getElementById("student-webinar-source-link");

  setTextIfPresent("student-webinar-subject", webinar.subject);
  setTextIfPresent("student-webinar-title", webinar.title);
  setTextIfPresent("student-webinar-description", webinar.description);
  setTextIfPresent("student-webinar-type", webinar.sourceTypeLabel);
  setTextIfPresent("student-webinar-time", formatDateTime(webinar.scheduledAt));
  setTextIfPresent("student-webinar-homeworks-count", webinarHomeworks.length);
  setTextIfPresent("student-webinar-teacher", webinar.teacher);

  if (sourceLink) {
    sourceLink.href = webinar.sourceUrl || buildWebinarDetailHref("student", webinar.id);
    sourceLink.hidden = !webinar.sourceUrl;
  }

  const player = document.getElementById("student-webinar-player");

  if (player) {
    player.innerHTML = renderWebinarPlayer(webinar, "teacher");
  }

  renderStudentHomeworks(document.getElementById("student-webinar-homeworks"), webinarHomeworks, "Все");
  renderWebinarMiniList(document.getElementById("student-related-webinars"), relatedWebinars, {
    role: "student"
  });
  setupRevealMotion();
};

const initStudentHomeworkView = async () => {
  const homeworkId = getQueryParam("id");

  if (!homeworkId) {
    window.location.href = "/student/dashboard/#homework";
    return;
  }

  const payload = await fetchStudentHomeworkDetail(homeworkId);

  if (!payload) {
    return;
  }

  hydrateStudentShell(payload);

  const { homework, linkedWebinar, relatedHomeworks } = payload;
  const submission = getHomeworkSubmissionState(homework.submissionStatus);
  const webinarLink = document.getElementById("student-homework-webinar-link");
  const gallery = document.getElementById("student-homework-gallery");
  const context = document.getElementById("student-homework-context");
  const related = document.getElementById("student-related-homeworks");
  const answerForm = document.getElementById("student-homework-answer-form");
  const answerInput = document.getElementById("student-homework-answer");
  const answerNote = document.getElementById("student-homework-answer-note");
  const draftButton = document.getElementById("student-homework-save-draft");
  const submitButton = document.getElementById("student-homework-submit-answer");

  setTextIfPresent("student-homework-subject", homework.subject);
  setTextIfPresent("student-homework-title", homework.title);
  setTextIfPresent("student-homework-instructions", homework.instructions);
  setTextIfPresent("student-homework-deadline", formatDateTime(homework.deadline));
  setTextIfPresent("student-homework-course", homework.courseLabel);
  setTextIfPresent("student-homework-status", submission.label);
  setTextIfPresent(
    "student-homework-status-meta",
    homework.submissionUpdatedAt
      ? `Обновлено ${formatDateTime(homework.submissionUpdatedAt)}`
      : "Ответ ещё не сохранён"
  );
  setTextIfPresent(
    "student-homework-checklist-status",
    homework.submissionSubmittedAt
      ? `Отправлено ${formatDateTime(homework.submissionSubmittedAt)}`
      : submission.note
  );
  setTextIfPresent(
    "student-homework-checklist-webinar",
    linkedWebinar ? linkedWebinar.title : "Задание не привязано к конкретному вебинару"
  );
  setTextIfPresent(
    "student-homework-checklist-deadline",
    `Дедлайн: ${formatDateTime(homework.deadline)}`
  );

  answerInput.value = homework.answerText || "";
  answerNote.dataset.kind = "info";
  answerNote.textContent = submission.note;

  if (webinarLink) {
    webinarLink.hidden = !linkedWebinar;

    if (linkedWebinar) {
      webinarLink.href = buildWebinarDetailHref("student", linkedWebinar.id);
    }
  }

  if (gallery) {
    gallery.innerHTML = homework.images.length
      ? homework.images
          .map(
            (image, index) => `
              <a class="homework-gallery__link" href="${escapeHtml(image)}" target="_blank" rel="noreferrer">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(`${homework.title} · материал ${index + 1}`)}" loading="lazy" />
              </a>
            `
          )
          .join("")
      : renderEmptyState("Пока без изображений", "Если преподаватель прикрепит схемы или материалы, они появятся здесь.");
  }

  if (context) {
    context.innerHTML = linkedWebinar
      ? `
          <article class="homework-context-card">
            <span class="timeline-pill">${escapeHtml(linkedWebinar.sourceTypeLabel)}</span>
            <h3>${escapeHtml(linkedWebinar.title)}</h3>
            <p>${escapeHtml(`${linkedWebinar.subject} · ${formatDateTime(linkedWebinar.scheduledAt)}`)}</p>
            <a class="surface-link surface-link--small" href="${buildWebinarDetailHref("student", linkedWebinar.id)}">Вернуться к вебинару</a>
          </article>
        `
      : renderEmptyState("Нет связанного вебинара", "Это домашнее задание опубликовано отдельно от конкретного занятия.");
  }

  renderHomeworkMiniList(related, relatedHomeworks);

  const setPending = (isPending) => {
    draftButton.disabled = isPending;
    submitButton.disabled = isPending;
  };

  const saveAnswer = async (status) => {
    setPending(true);

    try {
      const response = await apiRequest(`/api/student/homeworks/${encodeURIComponent(homework.id)}/answer`, {
        method: "POST",
        body: JSON.stringify({
          answerText: answerInput.value,
          status
        })
      });

      homework.submissionStatus = response.submission.status;
      homework.submissionSubmittedAt = response.submission.submittedAt || "";
      homework.submissionUpdatedAt = response.submission.updatedAt || "";
      homework.answerText = response.submission.answerText || "";

      const nextSubmission = getHomeworkSubmissionState(homework.submissionStatus);

      setTextIfPresent("student-homework-status", nextSubmission.label);
      setTextIfPresent(
        "student-homework-status-meta",
        homework.submissionUpdatedAt
          ? `Обновлено ${formatDateTime(homework.submissionUpdatedAt)}`
          : "Ответ ещё не сохранён"
      );
      setTextIfPresent(
        "student-homework-checklist-status",
        homework.submissionSubmittedAt
          ? `Отправлено ${formatDateTime(homework.submissionSubmittedAt)}`
          : nextSubmission.note
      );

      answerNote.dataset.kind = "success";
      answerNote.textContent = response.message;
    } catch (error) {
      answerNote.dataset.kind = "error";
      answerNote.textContent = error.message;
    } finally {
      setPending(false);
    }
  };

  draftButton.addEventListener("click", () => {
    saveAnswer("draft");
  });

  answerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveAnswer("submitted");
  });

  setupRevealMotion();
};

const renderTeacherStudents = (container, students, options = {}) => {
  if (!container) {
    return;
  }

  const items = students.slice(0, options.limit || students.length);

  container.innerHTML = items.length
    ? items
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

const renderTeacherWebinars = (container, webinars, options = {}) => {
  if (!container) {
    return;
  }

  const items = webinars.slice(0, options.limit || webinars.length);

  container.innerHTML = items.length
    ? items
        .map((item) => {
          if (options.expanded) {
            return `
              <article class="teacher-item teacher-item--webinar">
                <div class="teacher-item__media">
                  ${renderWebinarPlayer(item, "teacher")}
                </div>
                <div class="teacher-item__body">
                  <div class="teacher-item__header teacher-item__header--webinar">
                    <div>
                      <div class="teacher-item__eyebrow-row">
                        <span class="timeline-pill">${escapeHtml(item.sourceTypeLabel)}</span>
                        <strong>${escapeHtml(item.subject)}</strong>
                      </div>
                      <h3>${escapeHtml(item.title)}</h3>
                    </div>
                    <span class="teacher-item__date">${escapeHtml(formatDateTime(item.scheduledAt))}</span>
                  </div>
                  <p>${escapeHtml(item.description)}</p>
                  <div class="teacher-item__footer">
                    <span>${escapeHtml(`Преподаватель: ${item.teacher}`)}</span>
                    <div class="teacher-item__actions">
                      ${
                        item.sourceUrl
                          ? `<a class="surface-link surface-link--small" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Открыть источник</a>`
                          : `<span>Без внешней ссылки</span>`
                      }
                      ${
                        options.allowDelete
                          ? `<button class="danger-action" data-delete-webinar="${escapeHtml(item.id)}" type="button">Удалить</button>`
                          : ""
                      }
                    </div>
                  </div>
                </div>
              </article>
            `;
          }

          return `
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
                <div class="teacher-item__actions">
                  ${
                    item.sourceUrl
                      ? `<a class="surface-link surface-link--small" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Ссылка</a>`
                      : `<span>Без внешней ссылки</span>`
                  }
                  ${
                    options.allowDelete
                      ? `<button class="danger-action" data-delete-webinar="${escapeHtml(item.id)}" type="button">Удалить</button>`
                      : ""
                  }
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyState("Пока нет вебинаров", "Первый эфир или видеоурок, созданный преподавателем, появится здесь.");
};

const renderTeacherHomeworks = (container, homeworks, options = {}) => {
  if (!container) {
    return;
  }

  const items = homeworks.slice(0, options.limit || homeworks.length);

  container.innerHTML = items.length
    ? items
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

const renderWebinarDesignPreview = (container, webinar, override = {}) => {
  if (!container || !webinar) {
    return;
  }

  const previewItem = {
    ...webinar,
    title: override.title || webinar.title,
    coverImageUrl: Object.prototype.hasOwnProperty.call(override, "coverImageUrl")
      ? override.coverImageUrl
      : webinar.coverImageUrl
  };

  container.innerHTML = `
    <article class="webinar-showcase-card webinar-showcase-card--preview">
      <div class="webinar-showcase-card__cover">
        <span class="webinar-showcase-card__pin">★</span>
        <span class="webinar-showcase-card__dots">•••</span>
        ${renderWebinarPoster(previewItem, { coverImageUrl: previewItem.coverImageUrl })}
        <div class="webinar-showcase-card__chip">
          <span class="webinar-showcase-card__dot"></span>
          <span>${escapeHtml(previewItem.subject)}</span>
        </div>
      </div>
      <div class="webinar-showcase-card__body">
        <h3>${escapeHtml(previewItem.title)}</h3>
        <div class="webinar-showcase-card__meta">
          <span>${escapeHtml(formatDateTime(previewItem.scheduledAt))}</span>
          <strong>${escapeHtml(`${previewItem.homeworkCount || 0} ДЗ`)}</strong>
        </div>
        <div class="webinar-showcase-card__progress">
          <span style="width: ${getWebinarProgress(previewItem)}%"></span>
        </div>
      </div>
      <div class="webinar-showcase-card__footer">
        <span class="webinar-showcase-card__footer-note">Предпросмотр карточки вебинара</span>
      </div>
    </article>
  `;
};

const fetchTeacherWorkspace = async () => {
  try {
    return await apiRequest("/api/teacher/dashboard");
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "/login/?role=teacher";
      return null;
    }

    throw error;
  }
};

const setTextIfPresent = (id, value) => {
  const node = document.getElementById(id);

  if (node) {
    node.textContent = String(value);
  }
};

const hydrateTeacherShell = (payload) => {
  setTextIfPresent("teacher-name", payload.user.fullName);
  setTextIfPresent("teacher-initials", payload.user.initials);
  setTextIfPresent("teacher-students-count", payload.counts.students);
  setTextIfPresent("teacher-students-count-secondary", payload.counts.students);
  setTextIfPresent("teacher-assets-count", payload.counts.assets);
  setTextIfPresent("teacher-webinars-count", payload.counts.liveWebinars);
  setTextIfPresent("teacher-webinars-count-secondary", payload.counts.liveWebinars);
  setTextIfPresent("teacher-videos-count", payload.counts.videos);
  setTextIfPresent("teacher-homeworks-count", payload.counts.homeworks);
  setTextIfPresent("teacher-homeworks-count-secondary", payload.counts.homeworks);
  setTextIfPresent("teacher-homeworks-images-count", payload.counts.homeworkImages);

  const webinarTeacherInput = document.getElementById("webinar-teacher");

  if (webinarTeacherInput) {
    webinarTeacherInput.value = payload.user.fullName;
    webinarTeacherInput.readOnly = true;
  }
};

const initTeacherOverview = async () => {
  const payload = await fetchTeacherWorkspace();

  if (!payload) {
    return;
  }

  hydrateTeacherShell(payload);
  renderTeacherStudents(document.getElementById("teacher-overview-students"), payload.students, { limit: 3 });
  renderTeacherWebinars(document.getElementById("teacher-overview-webinars"), payload.webinars, { limit: 3 });
  renderTeacherHomeworks(document.getElementById("teacher-overview-homeworks"), payload.homeworks, { limit: 3 });
  setupRevealMotion();
};

const initTeacherStudents = async () => {
  const payload = await fetchTeacherWorkspace();

  if (!payload) {
    return;
  }

  hydrateTeacherShell(payload);
  renderTeacherStudents(document.getElementById("teacher-students"), payload.students);
  setupRevealMotion();
};

const initTeacherWebinars = async () => {
  const webinars = document.getElementById("teacher-webinars");
  const webinarForm = document.getElementById("webinar-form");
  const webinarFormNote = document.getElementById("webinar-form-note");

  const loadTeacherWebinars = async () => {
    const payload = await fetchTeacherWorkspace();

    if (!payload) {
      return null;
    }

    hydrateTeacherShell(payload);
    renderWebinarShowcase(webinars, payload.webinars, { role: "teacher", allowDelete: true });
    setupRevealMotion();
    return payload;
  };

  await loadTeacherWebinars();

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
      webinarFormNote.dataset.kind = "success";
      webinarFormNote.textContent = "Вебинар сохранён и уже доступен на платформе.";
      await loadTeacherWebinars();
    } catch (error) {
      webinarFormNote.dataset.kind = "error";
      webinarFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  webinars.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-webinar]");

    if (!button) {
      return;
    }

    const webinarTitle =
      button.closest(".webinar-showcase-card, .teacher-item")?.querySelector("h3")?.textContent || "этот вебинар";
    const shouldDelete = window.confirm(`Удалить «${webinarTitle}»?`);

    if (!shouldDelete) {
      return;
    }

    button.disabled = true;

    try {
      await apiRequest(`/api/teacher/webinars/${button.dataset.deleteWebinar}`, {
        method: "DELETE"
      });
      webinarFormNote.dataset.kind = "success";
      webinarFormNote.textContent = "Вебинар удалён.";
      await loadTeacherWebinars();
    } catch (error) {
      webinarFormNote.dataset.kind = "error";
      webinarFormNote.textContent = error.message;
      button.disabled = false;
    }
  });
};

const initTeacherWebinarView = async () => {
  let workspacePayload = await fetchTeacherWorkspace();

  if (!workspacePayload) {
    return;
  }

  const webinarId = getQueryParam("id");
  let currentWebinar = workspacePayload.webinars.find((item) => item.id === webinarId);

  if (!currentWebinar) {
    window.location.href = "/teacher/webinars/";
    return;
  }

  const sourceLink = document.getElementById("teacher-webinar-source-link");
  const player = document.getElementById("teacher-webinar-player");
  const designPreview = document.getElementById("webinar-design-preview");
  const designForm = document.getElementById("webinar-design-form");
  const designFormNote = document.getElementById("webinar-design-form-note");
  const designTitleInput = document.getElementById("webinar-design-title");
  const designImageInput = document.getElementById("webinar-design-image");
  const designRemoveCoverInput = document.getElementById("webinar-design-remove-cover");
  const homeworkForm = document.getElementById("webinar-homework-form");
  const homeworkFormNote = document.getElementById("webinar-homework-form-note");
  const preview = document.getElementById("webinar-homework-preview");
  const imagesInput = document.getElementById("webinar-homework-images");

  const clearWebinarCoverPreview = () => {
    if (authState.webinarCoverPreviewUrl) {
      URL.revokeObjectURL(authState.webinarCoverPreviewUrl);
      authState.webinarCoverPreviewUrl = "";
    }
  };

  const syncWebinarDesignPreview = () => {
    renderWebinarDesignPreview(designPreview, currentWebinar, {
      title: designTitleInput.value.trim() || currentWebinar.title,
      coverImageUrl: designRemoveCoverInput.checked ? "" : authState.webinarCoverPreviewUrl || currentWebinar.coverImageUrl
    });
    setupRevealMotion();
  };

  const renderCurrentTeacherWebinar = () => {
    const webinarHomeworks = workspacePayload.homeworks.filter((item) => item.webinarId === currentWebinar.id);
    const relatedWebinars = workspacePayload.webinars.filter((item) => item.id !== currentWebinar.id).slice(0, 4);

    hydrateTeacherShell(workspacePayload);
    setTextIfPresent("teacher-webinar-subject", currentWebinar.subject);
    setTextIfPresent("teacher-webinar-title", currentWebinar.title);
    setTextIfPresent("teacher-webinar-description", currentWebinar.description);
    setTextIfPresent("teacher-webinar-type", currentWebinar.sourceTypeLabel);
    setTextIfPresent("teacher-webinar-time", formatDateTime(currentWebinar.scheduledAt));
    setTextIfPresent("teacher-webinar-homeworks-count", webinarHomeworks.length);
    setTextIfPresent("teacher-webinar-teacher", currentWebinar.teacher);

    if (sourceLink) {
      sourceLink.href = currentWebinar.sourceUrl || buildWebinarDetailHref("teacher", currentWebinar.id);
      sourceLink.hidden = !currentWebinar.sourceUrl;
    }

    if (player) {
      player.innerHTML = renderWebinarPlayer(currentWebinar, "teacher");
    }

    renderTeacherHomeworks(document.getElementById("teacher-webinar-homeworks"), webinarHomeworks);
    renderWebinarMiniList(document.getElementById("teacher-related-webinars"), relatedWebinars, {
      role: "teacher"
    });

    designTitleInput.value = currentWebinar.title;
    syncWebinarDesignPreview();
    setupRevealMotion();
  };

  renderCurrentTeacherWebinar();

  renderHomeworkPreview(preview, []);

  imagesInput.addEventListener("change", () => {
    renderHomeworkPreview(preview, [...imagesInput.files]);
  });

  designTitleInput.addEventListener("input", () => {
    syncWebinarDesignPreview();
  });

  designImageInput.addEventListener("change", () => {
    clearWebinarCoverPreview();

    const file = designImageInput.files?.[0];

    if (file) {
      authState.webinarCoverPreviewUrl = URL.createObjectURL(file);
      designRemoveCoverInput.checked = false;
    }

    syncWebinarDesignPreview();
  });

  designRemoveCoverInput.addEventListener("change", () => {
    if (designRemoveCoverInput.checked) {
      clearWebinarCoverPreview();
      designImageInput.value = "";
    }

    syncWebinarDesignPreview();
  });

  designForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = designForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const formData = new FormData();
      formData.set("title", designTitleInput.value.trim());
      formData.set("removeCover", String(designRemoveCoverInput.checked));

      if (designImageInput.files?.[0]) {
        formData.append("coverImage", designImageInput.files[0]);
      }

      await apiRequest(`/api/teacher/webinars/${currentWebinar.id}/design`, {
        method: "POST",
        body: formData
      });

      designFormNote.dataset.kind = "success";
      designFormNote.textContent = "Оформление вебинара обновлено.";
      clearWebinarCoverPreview();
      designImageInput.value = "";
      designRemoveCoverInput.checked = false;

      workspacePayload = await fetchTeacherWorkspace();

      if (!workspacePayload) {
        return;
      }

      currentWebinar = workspacePayload.webinars.find((item) => item.id === webinarId);

      if (!currentWebinar) {
        window.location.href = "/teacher/webinars/";
        return;
      }

      renderCurrentTeacherWebinar();
    } catch (error) {
      designFormNote.dataset.kind = "error";
      designFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  homeworkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = homeworkForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      const formData = new FormData();
      formData.set("subject", document.getElementById("webinar-homework-subject").value);
      formData.set("title", document.getElementById("webinar-homework-title").value.trim());
      formData.set("deadline", document.getElementById("webinar-homework-deadline").value);
      formData.set("courseLabel", document.getElementById("webinar-homework-course").value.trim());
      formData.set("instructions", document.getElementById("webinar-homework-instructions").value.trim());
      formData.set("webinarId", currentWebinar.id);
      [...imagesInput.files].forEach((file) => formData.append("images", file));

      await apiRequest("/api/teacher/homeworks", {
        method: "POST",
        body: formData
      });

      homeworkForm.reset();
      renderHomeworkPreview(preview, []);
      homeworkFormNote.dataset.kind = "success";
      homeworkFormNote.textContent = "Домашнее задание добавлено внутрь этого вебинара.";

      workspacePayload = await fetchTeacherWorkspace();

      if (!workspacePayload) {
        return;
      }

      currentWebinar = workspacePayload.webinars.find((item) => item.id === webinarId) || currentWebinar;
      renderCurrentTeacherWebinar();
    } catch (error) {
      homeworkFormNote.dataset.kind = "error";
      homeworkFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  setupRevealMotion();
};

const initTeacherHomeworks = async () => {
  const homeworks = document.getElementById("teacher-homeworks");
  const homeworkForm = document.getElementById("homework-form");
  const homeworkFormNote = document.getElementById("homework-form-note");
  const preview = document.getElementById("homework-image-preview");
  const imagesInput = document.getElementById("homework-images");

  const loadTeacherHomeworks = async () => {
    const payload = await fetchTeacherWorkspace();

    if (!payload) {
      return null;
    }

    hydrateTeacherShell(payload);
    renderTeacherHomeworks(homeworks, payload.homeworks);
    setupRevealMotion();
    return payload;
  };

  await loadTeacherHomeworks();
  renderHomeworkPreview(preview, []);

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
      await loadTeacherHomeworks();
    } catch (error) {
      homeworkFormNote.dataset.kind = "error";
      homeworkFormNote.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
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

if (page === "student-webinars") {
  initStudentWebinars().catch((error) => {
    console.error(error);
  });
}

if (page === "student-webinar-view") {
  initStudentWebinarView().catch((error) => {
    console.error(error);
  });
}

if (page === "student-homework-view") {
  initStudentHomeworkView().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-overview") {
  initTeacherOverview().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-students") {
  initTeacherStudents().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-webinars") {
  initTeacherWebinars().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-webinar-view") {
  initTeacherWebinarView().catch((error) => {
    console.error(error);
  });
}

if (page === "teacher-homeworks") {
  initTeacherHomeworks().catch((error) => {
    console.error(error);
  });
}

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Pool, Client } = require("pg");

const scryptAsync = promisify(crypto.scrypt);

const ROOT_DIR = __dirname;
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const APP_DB_NAME = validateDatabaseName(process.env.APP_DB_NAME || "points_platform");
const SESSION_COOKIE = "platform_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_UPLOAD_FILES = 6;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const DEFAULT_COURSES = [
  {
    slug: "chemistry",
    title: "Химия",
    subject: "Химия",
    mentorName: "Катя Строганова",
    description: "Полный курс подготовки к ЕГЭ по химии с вебинарами, практикой и разбором второй части.",
    nextTopic: "Вводный модуль",
    sortOrder: 1
  },
  {
    slug: "russian-language",
    title: "Русский язык",
    subject: "Русский язык",
    mentorName: "Маша Птипца",
    description: "Курс по русскому языку с акцентом на сочинение, критерии и быстрые повторения.",
    nextTopic: "Вводный модуль",
    sortOrder: 2
  },
  {
    slug: "profile-math",
    title: "Профильная математика",
    subject: "Профильная математика",
    mentorName: "Саша Глебов",
    description: "Интенсив по профильной математике с задачами первой и второй части.",
    nextTopic: "Вводный модуль",
    sortOrder: 3
  }
];

const HTML_ROUTE_MAP = {
  "/": { file: "index.html" },
  "/login": { file: "login/index.html" },
  "/login/": { file: "login/index.html" },
  "/student/dashboard": { file: "student/dashboard/index.html", role: "student" },
  "/student/dashboard/": { file: "student/dashboard/index.html", role: "student" },
  "/teacher/dashboard": { file: "teacher/dashboard/index.html", role: "teacher" },
  "/teacher/dashboard/": { file: "teacher/dashboard/index.html", role: "teacher" }
};

let pool;

function validateDatabaseName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid PostgreSQL database name: ${name}`);
  }

  return name;
}

function createPgConfig(database) {
  return {
    host: process.env.PGHOST || "/tmp",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || os.userInfo().username,
    password: process.env.PGPASSWORD || undefined,
    database
  };
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sendError(res, status, message, extra = {}) {
  json(res, status, { ok: false, message, ...extra });
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...headers
  });
  res.end();
}

function parseCookies(header = "") {
  return header
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, chunk) => {
      const separatorIndex = chunk.indexOf("=");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = chunk.slice(0, separatorIndex);
      const value = chunk.slice(separatorIndex + 1);
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function buildSetCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function buildExpiredSessionCookie() {
  return buildSetCookie(SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 0
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (symbol) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[symbol];
  });
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getSourceTypeLabel(type) {
  return (
    {
      live: "Прямой эфир",
      youtube: "YouTube",
      vk: "VK Video"
    }[type] || "Видео"
  );
}

function normalizeExternalUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch (error) {
    return "";
  }
}

function getYouTubeEmbedUrl(value) {
  const normalized = normalizeExternalUrl(value);

  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace("www.", "");

    if (host === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }

    if (host.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return normalized;
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        const videoId = parsed.pathname.split("/")[2];
        return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
      }

      const videoId = parsed.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
  } catch (error) {
    return "";
  }

  return "";
}

function getVkEmbedUrl(value) {
  const normalized = normalizeExternalUrl(value);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("video_ext.php")) {
    return normalized;
  }

  const match = normalized.match(/video(-?\d+)_([0-9]+)/);

  if (!match) {
    return "";
  }

  return `https://vkvideo.ru/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=0`;
}

function resolveEmbedUrl(type, sourceUrl) {
  if (type === "youtube") {
    return getYouTubeEmbedUrl(sourceUrl);
  }

  if (type === "vk") {
    return getVkEmbedUrl(sourceUrl);
  }

  return "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, originalHash] = String(stored || "").split(":");

  if (!salt || !originalHash) {
    return false;
  }

  const candidate = await scryptAsync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, "hex");

  if (candidate.length !== originalBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, originalBuffer);
}

function safeResolve(root, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.resolve(root, normalized);

  if (!resolved.startsWith(root)) {
    return null;
  }

  return resolved;
}

async function ensureRuntime() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await ensureDatabase();
  pool = new Pool(createPgConfig(APP_DB_NAME));
  await runMigrations();
  await seedBaseData();
}

async function ensureDatabase() {
  const systemClient = new Client(createPgConfig("postgres"));
  await systemClient.connect();

  try {
    const databaseCheck = await systemClient.query(
      "select 1 from pg_database where datname = $1",
      [APP_DB_NAME]
    );

    if (databaseCheck.rowCount === 0) {
      await systemClient.query(`create database ${APP_DB_NAME}`);
    }
  } finally {
    await systemClient.end();
  }
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists users (
        id text primary key,
        role text not null check (role in ('student', 'teacher')),
        full_name text not null,
        email text not null unique,
        password_hash text not null,
        grade text,
        exam_year integer,
        created_at timestamptz not null default now()
      );

      create table if not exists sessions (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      create index if not exists idx_sessions_expires_at on sessions(expires_at);
      create index if not exists idx_users_role on users(role);

      create table if not exists student_profiles (
        user_id text primary key references users(id) on delete cascade,
        mentor_name text not null default 'Арина',
        lives integer not null default 5,
        streak_days integer not null default 0,
        solved_tasks integer not null default 0,
        predicted_score integer not null default 0,
        overall_progress integer not null default 0
      );

      create table if not exists courses (
        id text primary key,
        slug text not null unique,
        title text not null,
        subject text not null,
        mentor_name text not null,
        description text not null,
        default_next_topic text not null,
        sort_order integer not null default 0
      );

      create table if not exists enrollments (
        user_id text not null references users(id) on delete cascade,
        course_id text not null references courses(id) on delete cascade,
        progress integer not null default 0,
        score integer not null default 0,
        next_topic text not null,
        primary key (user_id, course_id)
      );

      create table if not exists webinars (
        id text primary key,
        title text not null,
        subject text not null,
        type text not null check (type in ('live', 'youtube', 'vk')),
        source_url text,
        embed_url text,
        teacher_id text references users(id) on delete set null,
        teacher_name text not null,
        scheduled_at timestamptz not null,
        description text not null,
        created_at timestamptz not null default now()
      );

      create index if not exists idx_webinars_scheduled_at on webinars(scheduled_at);

      create table if not exists homeworks (
        id text primary key,
        subject text not null,
        title text not null,
        deadline timestamptz not null,
        course_label text not null,
        instructions text not null,
        teacher_id text references users(id) on delete set null,
        teacher_name text not null,
        created_at timestamptz not null default now()
      );

      create index if not exists idx_homeworks_deadline on homeworks(deadline);

      create table if not exists homework_images (
        id text primary key,
        homework_id text not null references homeworks(id) on delete cascade,
        stored_name text not null,
        original_name text,
        mime_type text,
        sort_order integer not null default 0
      );

      create table if not exists announcements (
        id text primary key,
        title text not null,
        body text not null,
        author_name text not null,
        badge text not null,
        created_at timestamptz not null default now()
      );
    `);
  } finally {
    client.release();
  }
}

async function seedBaseData() {
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const course of DEFAULT_COURSES) {
      await client.query(
        `
          insert into courses (id, slug, title, subject, mentor_name, description, default_next_topic, sort_order)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict (slug) do update set
            title = excluded.title,
            subject = excluded.subject,
            mentor_name = excluded.mentor_name,
            description = excluded.description,
            default_next_topic = excluded.default_next_topic,
            sort_order = excluded.sort_order
        `,
        [
          course.slug,
          course.slug,
          course.title,
          course.subject,
          course.mentorName,
          course.description,
          course.nextTopic,
          course.sortOrder
        ]
      );
    }

    const announcementsCount = await client.query("select count(*)::int as count from announcements");

    if (announcementsCount.rows[0].count === 0) {
      await client.query(
        `
          insert into announcements (id, title, body, author_name, badge)
          values ($1, $2, $3, $4, $5)
        `,
        [
          crypto.randomUUID(),
          "Платформа готова к работе",
          "Регистрация открыта. После входа ученики увидят свои курсы, а преподаватели смогут публиковать вебинары и домашние задания.",
          "Система",
          "SYS"
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function getCurrentSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE];

  if (!sessionId || !pool) {
    return null;
  }

  const result = await pool.query(
    `
      select
        s.id as session_id,
        s.expires_at,
        u.id as user_id,
        u.role,
        u.full_name,
        u.email,
        u.grade,
        u.exam_year,
        u.created_at
      from sessions s
      join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()
      limit 1
    `,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function createSession(userId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    "insert into sessions (id, user_id, expires_at) values ($1, $2, $3)",
    [sessionId, userId, expiresAt]
  );

  return {
    sessionId,
    expiresAt
  };
}

async function destroySession(sessionId) {
  if (!sessionId) {
    return;
  }

  await pool.query("delete from sessions where id = $1", [sessionId]);
}

async function clearSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  await destroySession(cookies[SESSION_COOKIE]);
  return buildExpiredSessionCookie();
}

async function parseJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function parseMultipartForm(req) {
  const request = new Request(`http://${req.headers.host || "127.0.0.1"}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half"
  });

  return request.formData();
}

async function collectLandingSummary() {
  const client = await pool.connect();

  try {
    const [studentsCount, webinarsCount, homeworksCount, announcementCount, webinars, homeworks] =
      await Promise.all([
        client.query("select count(*)::int as count from users where role = 'student'"),
        client.query("select count(*)::int as count from webinars"),
        client.query("select count(*)::int as count from homeworks"),
        client.query("select count(*)::int as count from announcements"),
        client.query(
          `
            select id, title, subject, type, teacher_name, scheduled_at, description
            from webinars
            order by scheduled_at asc
            limit 3
          `
        ),
        client.query(
          `
            select
              h.id,
              h.subject,
              h.title,
              h.instructions,
              hi.stored_name
            from homeworks h
            left join lateral (
              select stored_name
              from homework_images
              where homework_id = h.id
              order by sort_order asc
              limit 1
            ) hi on true
            order by h.created_at desc
            limit 2
          `
        )
      ]);

    return {
      counts: {
        students: studentsCount.rows[0].count,
        webinars: webinarsCount.rows[0].count,
        homeworks: homeworksCount.rows[0].count,
        announcements: announcementCount.rows[0].count
      },
      webinars: webinars.rows.map((item) => ({
        ...item,
        sourceTypeLabel: getSourceTypeLabel(item.type)
      })),
      homeworks: homeworks.rows.map((item) => ({
        ...item,
        imageUrl: item.stored_name ? `/uploads/${item.stored_name}` : ""
      }))
    };
  } finally {
    client.release();
  }
}

async function collectAnnouncements(limit = 4) {
  const result = await pool.query(
    `
      select id, title, body, author_name, badge, created_at
      from announcements
      order by created_at desc
      limit $1
    `,
    [limit]
  );

  return result.rows.map((item) => ({
    id: item.id,
    initials: item.badge,
    title: item.title,
    meta: formatDateTime(item.created_at),
    text: item.body
  }));
}

async function collectWebinars() {
  const result = await pool.query(
    `
      select id, title, subject, type, source_url, embed_url, teacher_name, scheduled_at, description, created_at
      from webinars
      order by scheduled_at asc, created_at desc
    `
  );

  return result.rows.map((item) => ({
    id: item.id,
    title: item.title,
    subject: item.subject,
    type: item.type,
    sourceUrl: item.source_url || "",
    embedUrl: item.embed_url || "",
    teacher: item.teacher_name,
    scheduledAt: item.scheduled_at,
    description: item.description,
    sourceTypeLabel: getSourceTypeLabel(item.type)
  }));
}

async function collectHomeworks() {
  const result = await pool.query(
    `
      select
        h.id,
        h.subject,
        h.title,
        h.deadline,
        h.course_label,
        h.instructions,
        h.teacher_name,
        h.created_at,
        hi.id as image_id,
        hi.stored_name,
        hi.mime_type,
        hi.sort_order
      from homeworks h
      left join homework_images hi on hi.homework_id = h.id
      order by h.deadline asc, h.created_at desc, hi.sort_order asc
    `
  );

  const grouped = new Map();

  for (const row of result.rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        subject: row.subject,
        title: row.title,
        deadline: row.deadline,
        courseLabel: row.course_label,
        instructions: row.instructions,
        teacher: row.teacher_name,
        createdAt: row.created_at,
        images: []
      });
    }

    if (row.stored_name) {
      grouped.get(row.id).images.push(`/uploads/${row.stored_name}`);
    }
  }

  return [...grouped.values()];
}

async function collectStudentDashboard(userId) {
  const client = await pool.connect();

  try {
    const [userResult, profileResult, enrollmentsResult, webinars, homeworks, announcements] =
      await Promise.all([
        client.query(
          `
            select id, role, full_name, email, grade, exam_year, created_at
            from users
            where id = $1
            limit 1
          `,
          [userId]
        ),
        client.query(
          `
            select mentor_name, lives, streak_days, solved_tasks, predicted_score, overall_progress
            from student_profiles
            where user_id = $1
            limit 1
          `,
          [userId]
        ),
        client.query(
          `
            select
              c.id,
              c.title,
              c.subject,
              c.mentor_name,
              c.description,
              e.progress,
              e.score,
              e.next_topic
            from enrollments e
            join courses c on c.id = e.course_id
            where e.user_id = $1
            order by c.sort_order asc
          `,
          [userId]
        ),
        collectWebinars(),
        collectHomeworks(),
        collectAnnouncements()
      ]);

    const user = userResult.rows[0];
    const profile = profileResult.rows[0];
    const courses = enrollmentsResult.rows.map((row) => ({
      id: row.id,
      name: row.title,
      subject: row.subject,
      mentor: row.mentor_name,
      description: row.description,
      progress: row.progress,
      score: row.score,
      nextTopic: row.next_topic
    }));

    return {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        grade: user.grade || "Без класса",
        examYear: user.exam_year || "",
        initials: getInitials(user.full_name)
      },
      profile: {
        mentorName: profile?.mentor_name || "Арина",
        lives: profile?.lives || 0,
        streakDays: profile?.streak_days || 0,
        solvedTasks: profile?.solved_tasks || 0,
        predictedScore: profile?.predicted_score || 0,
        overallProgress: profile?.overall_progress || 0
      },
      courses,
      webinars,
      homeworks,
      announcements
    };
  } finally {
    client.release();
  }
}

async function collectTeacherDashboard(userId) {
  const client = await pool.connect();

  try {
    const [userResult, studentsResult, webinars, homeworks, countsResult] = await Promise.all([
      client.query(
        `
          select id, full_name, email, created_at
          from users
          where id = $1
          limit 1
        `,
        [userId]
      ),
      client.query(
        `
          select
            u.id,
            u.full_name,
            u.email,
            u.grade,
            u.exam_year,
            u.created_at,
            sp.mentor_name,
            sp.lives,
            sp.streak_days,
            sp.solved_tasks,
            sp.predicted_score,
            sp.overall_progress,
            coalesce(string_agg(c.title, ' · ' order by c.sort_order), '') as courses
          from users u
          left join student_profiles sp on sp.user_id = u.id
          left join enrollments e on e.user_id = u.id
          left join courses c on c.id = e.course_id
          where u.role = 'student'
          group by u.id, sp.user_id
          order by u.created_at desc
        `
      ),
      collectWebinars(),
      collectHomeworks(),
      client.query(
        `
          select
            (select count(*)::int from users where role = 'student') as students_count,
            (select count(*)::int from webinars where type = 'live') as live_count,
            (select count(*)::int from webinars where type <> 'live') as video_count,
            (select count(*)::int from homeworks) as homework_count,
            (select count(*)::int from homework_images) as homework_image_count
        `
      )
    ]);

    const teacher = userResult.rows[0];
    const counts = countsResult.rows[0];

    return {
      user: {
        id: teacher.id,
        fullName: teacher.full_name,
        email: teacher.email,
        initials: getInitials(teacher.full_name)
      },
      counts: {
        students: counts.students_count,
        liveWebinars: counts.live_count,
        videos: counts.video_count,
        homeworks: counts.homework_count,
        homeworkImages: counts.homework_image_count,
        assets: counts.live_count + counts.video_count + counts.homework_count
      },
      students: studentsResult.rows.map((student) => ({
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        grade: student.grade || "Без класса",
        examYear: student.exam_year || "",
        mentorName: student.mentor_name || "Арина",
        lives: student.lives || 0,
        streakDays: student.streak_days || 0,
        solvedTasks: student.solved_tasks || 0,
        predictedScore: student.predicted_score || 0,
        overallProgress: student.overall_progress || 0,
        courses: student.courses,
        initials: getInitials(student.full_name),
        lastSeen: formatDateTime(student.created_at)
      })),
      webinars,
      homeworks
    };
  } finally {
    client.release();
  }
}

function getInitials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "УЧ";
}

async function createStudentProfileAndEnrollments(client, user) {
  await client.query(
    `
      insert into student_profiles (user_id, mentor_name, lives, streak_days, solved_tasks, predicted_score, overall_progress)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (user_id) do nothing
    `,
    [user.id, "Арина", 5, 0, 0, 0, 0]
  );

  const coursesResult = await client.query(
    `
      select id, default_next_topic
      from courses
      order by sort_order asc
    `
  );

  for (const course of coursesResult.rows) {
    await client.query(
      `
        insert into enrollments (user_id, course_id, progress, score, next_topic)
        values ($1, $2, $3, $4, $5)
        on conflict (user_id, course_id) do nothing
      `,
      [user.id, course.id, 0, 0, course.default_next_topic]
    );
  }
}

async function appendAnnouncement(client, title, body, badge) {
  await client.query(
    `
      insert into announcements (id, title, body, author_name, badge)
      values ($1, $2, $3, $4, $5)
    `,
    [crypto.randomUUID(), title, body, badge === "SYS" ? "Система" : title, badge]
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRole(role) {
  return role === "student" || role === "teacher";
}

function getRedirectByRole(role) {
  return role === "teacher" ? "/teacher/dashboard/" : "/student/dashboard/";
}

function getExtension(file) {
  const original = path.extname(file.name || "").toLowerCase();

  if (original) {
    return original.replace(/[^a-z0-9.]/gi, "");
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "image/jpeg") {
    return ".jpg";
  }

  if (file.type === "image/webp") {
    return ".webp";
  }

  if (file.type === "image/svg+xml") {
    return ".svg";
  }

  return ".bin";
}

async function saveFiles(files) {
  const stored = [];

  for (const file of files.slice(0, MAX_UPLOAD_FILES)) {
    if (!file || typeof file.arrayBuffer !== "function") {
      continue;
    }

    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("Можно загружать только изображения.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new Error("Каждое изображение должно быть меньше 5 МБ.");
    }

    const storedName = `${crypto.randomUUID()}${getExtension(file)}`;
    await fs.writeFile(path.join(UPLOADS_DIR, storedName), buffer);
    stored.push({
      storedName,
      originalName: file.name || storedName,
      mimeType: file.type || "application/octet-stream"
    });
  }

  return stored;
}

async function handleRegister(req, res) {
  let payload;

  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendError(res, 400, "Некорректный JSON в запросе.");
  }

  const role = String(payload.role || "").trim();
  const fullName = String(payload.fullName || "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const grade = String(payload.grade || "").trim();
  const examYear = payload.examYear ? Number(payload.examYear) : null;

  if (!validateRole(role)) {
    return sendError(res, 400, "Выбери корректную роль пользователя.");
  }

  if (fullName.length < 2) {
    return sendError(res, 400, "Укажи имя пользователя.");
  }

  if (!validateEmail(email)) {
    return sendError(res, 400, "Укажи корректный email.");
  }

  if (password.length < 8) {
    return sendError(res, 400, "Пароль должен содержать минимум 8 символов.");
  }

  if (role === "student" && !grade) {
    return sendError(res, 400, "Для ученика нужно указать класс.");
  }

  const existing = await pool.query("select 1 from users where email = $1 limit 1", [email]);

  if (existing.rowCount > 0) {
    return sendError(res, 409, "Пользователь с таким email уже зарегистрирован.");
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("begin");

    const user = {
      id: crypto.randomUUID(),
      role,
      fullName,
      email,
      grade: role === "student" ? grade : null,
      examYear: role === "student" && examYear ? examYear : null
    };

    await client.query(
      `
        insert into users (id, role, full_name, email, password_hash, grade, exam_year)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [user.id, user.role, user.fullName, user.email, passwordHash, user.grade, user.examYear]
    );

    if (role === "student") {
      await createStudentProfileAndEnrollments(client, user);
    }

    await client.query(
      `
        insert into announcements (id, title, body, author_name, badge)
        values ($1, $2, $3, $4, $5)
      `,
      [
        crypto.randomUUID(),
        role === "teacher" ? "Новый преподаватель на платформе" : "Новый ученик на платформе",
        role === "teacher"
          ? `${fullName} зарегистрировался как преподаватель и получил доступ к управлению контентом.`
          : `${fullName} зарегистрировался на платформе и получил доступ к курсам.`,
        fullName,
        role === "teacher" ? "TR" : "ST"
      ]
    );

    await client.query("commit");

    const session = await createSession(user.id);
    json(
      res,
      201,
      {
        ok: true,
        redirectTo: getRedirectByRole(role)
      },
      {
        "Set-Cookie": buildSetCookie(SESSION_COOKIE, session.sessionId, {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          maxAge: Math.floor(SESSION_TTL_MS / 1000)
        })
      }
    );
  } catch (error) {
    await client.query("rollback");
    console.error(error);
    sendError(res, 500, "Не удалось завершить регистрацию.");
  } finally {
    client.release();
  }
}

async function handleLogin(req, res) {
  let payload;

  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendError(res, 400, "Некорректный JSON в запросе.");
  }

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!validateEmail(email) || password.length < 8) {
    return sendError(res, 400, "Проверь email и пароль.");
  }

  const result = await pool.query(
    `
      select id, role, full_name, email, password_hash
      from users
      where email = $1
      limit 1
    `,
    [email]
  );

  if (result.rowCount === 0) {
    return sendError(res, 401, "Пользователь не найден.");
  }

  const user = result.rows[0];
  const isValidPassword = await verifyPassword(password, user.password_hash);

  if (!isValidPassword) {
    return sendError(res, 401, "Неверный пароль.");
  }

  const session = await createSession(user.id);

  json(
    res,
    200,
    {
      ok: true,
      redirectTo: getRedirectByRole(user.role)
    },
    {
      "Set-Cookie": buildSetCookie(SESSION_COOKIE, session.sessionId, {
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        maxAge: Math.floor(SESSION_TTL_MS / 1000)
      })
    }
  );
}

async function handleLogout(req, res) {
  const expiredCookie = await clearSessionFromRequest(req);

  json(
    res,
    200,
    { ok: true },
    {
      "Set-Cookie": expiredCookie
    }
  );
}

async function handleLogoutRedirect(req, res) {
  const expiredCookie = await clearSessionFromRequest(req);
  redirect(res, "/login/", {
    "Set-Cookie": expiredCookie
  });
}

async function handleCreateWebinar(req, res, session) {
  let payload;

  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendError(res, 400, "Некорректный JSON в запросе.");
  }

  const title = String(payload.title || "").trim();
  const subject = String(payload.subject || "").trim();
  const type = String(payload.type || "").trim();
  const sourceUrl = normalizeExternalUrl(payload.sourceUrl || "");
  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  const description = String(payload.description || "").trim();
  const embedUrl = resolveEmbedUrl(type, sourceUrl);

  if (!title || !subject || !description || !scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return sendError(res, 400, "Заполни все обязательные поля вебинара.");
  }

  if (!["live", "youtube", "vk"].includes(type)) {
    return sendError(res, 400, "Укажи корректный формат вебинара.");
  }

  if ((type === "youtube" || type === "vk") && !embedUrl) {
    return sendError(res, 400, "Для YouTube и VK Video нужна корректная ссылка на видео.");
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `
        insert into webinars (
          id, title, subject, type, source_url, embed_url, teacher_id, teacher_name, scheduled_at, description
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        crypto.randomUUID(),
        title,
        subject,
        type,
        sourceUrl || null,
        embedUrl || null,
        session.user_id,
        session.full_name,
        scheduledAt,
        description
      ]
    );

    await client.query(
      `
        insert into announcements (id, title, body, author_name, badge)
        values ($1, $2, $3, $4, $5)
      `,
      [
        crypto.randomUUID(),
        "Новый вебинар опубликован",
        `${session.full_name} добавил материал «${title}» по предмету ${subject}.`,
        session.full_name,
        "WEB"
      ]
    );

    await client.query("commit");
    json(res, 201, { ok: true, message: "Вебинар сохранён." });
  } catch (error) {
    await client.query("rollback");
    console.error(error);
    sendError(res, 500, "Не удалось сохранить вебинар.");
  } finally {
    client.release();
  }
}

async function handleCreateHomework(req, res, session) {
  let formData;

  try {
    formData = await parseMultipartForm(req);
  } catch (error) {
    console.error(error);
    return sendError(res, 400, "Не удалось разобрать форму с домашним заданием.");
  }

  const subject = String(formData.get("subject") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const deadlineValue = String(formData.get("deadline") || "").trim();
  const courseLabel = String(formData.get("courseLabel") || "").trim();
  const instructions = String(formData.get("instructions") || "").trim();
  const deadline = deadlineValue ? new Date(deadlineValue) : null;

  if (!subject || !title || !courseLabel || !instructions || !deadline || Number.isNaN(deadline.getTime())) {
    return sendError(res, 400, "Заполни все обязательные поля домашнего задания.");
  }

  const files = formData
    .getAll("images")
    .filter((item) => item && typeof item === "object" && typeof item.arrayBuffer === "function");

  let storedFiles = [];

  try {
    storedFiles = await saveFiles(files);
  } catch (error) {
    return sendError(res, 400, error.message);
  }

  const client = await pool.connect();

  try {
    await client.query("begin");

    const homeworkId = crypto.randomUUID();

    await client.query(
      `
        insert into homeworks (
          id, subject, title, deadline, course_label, instructions, teacher_id, teacher_name
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [homeworkId, subject, title, deadline, courseLabel, instructions, session.user_id, session.full_name]
    );

    for (const [index, file] of storedFiles.entries()) {
      await client.query(
        `
          insert into homework_images (id, homework_id, stored_name, original_name, mime_type, sort_order)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [crypto.randomUUID(), homeworkId, file.storedName, file.originalName, file.mimeType, index]
      );
    }

    await client.query(
      `
        insert into announcements (id, title, body, author_name, badge)
        values ($1, $2, $3, $4, $5)
      `,
      [
        crypto.randomUUID(),
        "Новая домашка в курсе",
        `${session.full_name} добавил домашнее задание «${title}» по предмету ${subject}.`,
        session.full_name,
        "HW"
      ]
    );

    await client.query("commit");
    json(res, 201, { ok: true, message: "Домашнее задание сохранено." });
  } catch (error) {
    await client.query("rollback");
    console.error(error);
    sendError(res, 500, "Не удалось сохранить домашнее задание.");
  } finally {
    client.release();
  }
}

async function handleApi(req, res, url, session) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/platform/summary" && req.method === "GET") {
    const payload = await collectLandingSummary();
    return json(res, 200, { ok: true, ...payload });
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    if (!session) {
      return sendError(res, 401, "Сессия не найдена.");
    }

    return json(res, 200, {
      ok: true,
      user: {
        id: session.user_id,
        role: session.role,
        fullName: session.full_name,
        email: session.email
      }
    });
  }

  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    return handleRegister(req, res);
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    return handleLogin(req, res);
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    return handleLogout(req, res);
  }

  if (url.pathname === "/api/student/dashboard" && req.method === "GET") {
    if (!session || session.role !== "student") {
      return sendError(res, 401, "Вход для ученика обязателен.");
    }

    const payload = await collectStudentDashboard(session.user_id);
    return json(res, 200, { ok: true, ...payload });
  }

  if (url.pathname === "/api/teacher/dashboard" && req.method === "GET") {
    if (!session || session.role !== "teacher") {
      return sendError(res, 401, "Вход для преподавателя обязателен.");
    }

    const payload = await collectTeacherDashboard(session.user_id);
    return json(res, 200, { ok: true, ...payload });
  }

  if (url.pathname === "/api/teacher/webinars" && req.method === "POST") {
    if (!session || session.role !== "teacher") {
      return sendError(res, 401, "Только преподаватель может добавлять вебинары.");
    }

    return handleCreateWebinar(req, res, session);
  }

  if (url.pathname === "/api/teacher/homeworks" && req.method === "POST") {
    if (!session || session.role !== "teacher") {
      return sendError(res, 401, "Только преподаватель может добавлять домашние задания.");
    }

    return handleCreateHomework(req, res, session);
  }

  return sendError(res, 404, "API-маршрут не найден.");
}

async function serveResolvedFile(res, absolutePath) {
  const file = await fs.readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const type = CONTENT_TYPES[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=60",
    "Content-Length": file.length
  });
  res.end(file);
}

async function tryServeStatic(res, pathname) {
  const relativePath = pathname.replace(/^\/+/, "");
  const absolutePath = safeResolve(ROOT_DIR, relativePath);

  if (!absolutePath) {
    return false;
  }

  try {
    const stat = await fs.stat(absolutePath);

    if (!stat.isFile()) {
      return false;
    }

    await serveResolvedFile(res, absolutePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function serveUpload(res, pathname) {
  const filename = pathname.replace(/^\/uploads\//, "");
  const absolutePath = safeResolve(UPLOADS_DIR, filename);

  if (!absolutePath) {
    return sendError(res, 404, "Файл не найден.");
  }

  try {
    await serveResolvedFile(res, absolutePath);
  } catch (error) {
    sendError(res, 404, "Файл не найден.");
  }
}

async function handlePage(req, res, url, session) {
  const route = HTML_ROUTE_MAP[url.pathname];

  if (route) {
    if (route.role && (!session || session.role !== route.role)) {
      return redirect(res, `/login/?role=${route.role}`);
    }

    return serveResolvedFile(res, path.join(ROOT_DIR, route.file));
  }

  const served = await tryServeStatic(res, url.pathname);

  if (!served) {
    sendError(res, 404, "Страница не найдена.");
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const session = await getCurrentSession(req);

  if (url.pathname === "/logout" && (req.method === "GET" || req.method === "HEAD")) {
    return handleLogoutRedirect(req, res);
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url, session);
  }

  if (url.pathname.startsWith("/uploads/")) {
    return serveUpload(res, url.pathname);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendError(res, 405, "Метод не поддерживается.");
  }

  return handlePage(req, res, url, session);
}

async function bootstrap() {
  await ensureRuntime();

  const server = http.createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      console.error(error);
      sendError(res, 500, "Внутренняя ошибка сервера.");
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`PostgreSQL database: ${APP_DB_NAME}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
# 100points Platform

В проекте теперь четыре ключевых маршрута:

- `http://127.0.0.1:3000/` — лендинг платформы
- `http://127.0.0.1:3000/login/` — вход и регистрация с ролями `ученик` и `преподаватель`
- `http://127.0.0.1:3000/student/dashboard/` — кабинет ученика
- `http://127.0.0.1:3000/teacher/dashboard/` — кабинет преподавателя

## Что уже подключено

- PostgreSQL как единая база данных платформы
- регистрация и логин пользователей с ролями `student` и `teacher`
- cookie-сессии и защищённые маршруты кабинетов
- teacher dashboard со списком всех учеников платформы
- создание вебинаров и видео из `VK Video` и `YouTube`
- создание домашних заданий с прикреплёнными изображениями
- автоматическое отражение новых материалов в кабинете ученика и на лендинге

## Быстрый запуск

Сервер сам подготавливает базу `points_platform`, создаёт таблицы и базовые курсы.

```bash
cd /Users/yaromirtribunsky/Documents/Codex/2026-05-01/https-lk-100points-ru-student-dashboard
node server.js
```

После запуска открой `http://127.0.0.1:3000/`.

## Переменные окружения

Если PostgreSQL работает не на локальном Unix socket, можно переопределить настройки через переменные:

- `HOST` и `PORT` — адрес HTTP-сервера
- `APP_DB_NAME` — имя базы платформы
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` — доступ к PostgreSQL

Пример лежит в [.env.example](/Users/yaromirtribunsky/Documents/Codex/2026-05-01/https-lk-100points-ru-student-dashboard/.env.example:1).

## Техническая проверка

- `node scripts/e2e-smoke.js` — сквозной браузерный smoke-test: регистрация, teacher dashboard, публикация материалов, вход ученика
- `node scripts/cleanup-test-data.js` — удаление временных `example.com` тест-аккаунтов и материалов после smoke-теста
# intellikanewplatform

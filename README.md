# 📍 PEREMENA

Учёт посещаемости и спортивной формы на уроках физкультуры — №104 ЖББ мектеби, 9-В класс (34 ученика).
Frontend → Express API → Neon PostgreSQL. Хостинг: Render.

## Структура
```
peremena/
├── public/ (index.html, style.css, app.js)
├── server/ (server.js, db.js, routes.js)
├── package.json
├── .env.example
└── README.md
```

## Как это работает
- При первом запуске сервер сам создаёт таблицы `students`, `lessons`, `attendance`, `reports` и добавляет 34 учеников.
- Отметки сохраняются на сервере автоматически (через 0,7 с после изменения) — обновление страницы ничего не теряет.
- `present` / `uniform`: `true` — да, `false` — нет, `null` — ещё не отмечено.
- Отчёт создаётся при завершении занятия. Форма считается только среди пришедших.
- Очистка: при запуске и каждые 6 часов удаляются занятия старше 30 дней вместе с отчётами и отметками. Список учеников не удаляется.
- Ученик из списка «удаляется» мягко: он пропадает из новых занятий, но старые отчёты не ломаются.

## Локальный запуск
1. Установите Node.js 18+.
2. `npm install`
3. Скопируйте `.env.example` в `.env` и вставьте свой `DATABASE_URL` из Neon.
4. `npm start` → откройте http://localhost:3000

## Деплой на Render
1. **Neon:** зайдите на neon.tech → создайте проект (PostgreSQL).
2. **DATABASE_URL:** в проекте нажмите **Connect** → скопируйте строку подключения (с `sslmode=require`).
3. **GitHub:** создайте репозиторий и загрузите в него проект (файл `.env` загружать нельзя — он в `.gitignore`).
4. **Render:** New → **Web Service** → подключите репозиторий GitHub.
5. Настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. **Environment Variables:** добавьте `DATABASE_URL` = ваша строка из Neon.
7. Нажмите **Deploy**. Сайт откроется по адресу вида `https://peremena.onrender.com`.

### Переменные окружения
| Имя | Обязательно | Значение |
|---|---|---|
| `DATABASE_URL` | да | строка подключения Neon |
| `PORT` | нет | Render задаёт сам |
| `CLASS_NAME` | нет | по умолчанию `9-В` |
| `TZ_NAME` | нет | по умолчанию `Asia/Bishkek` (определяет «сегодня») |

Бесплатный тариф Render «засыпает» без запросов — первое открытие может занять около минуты.

## API
`GET/POST /api/students`, `PUT/DELETE /api/students/:id`, `GET/POST /api/lessons`, `GET /api/lessons/today`, `GET/PUT /api/lessons/:id`, `POST /api/lessons/:id/finish`, `GET /api/reports`, `GET /api/reports/:id`, `GET /api/statistics`, `GET /healthz`.

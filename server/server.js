require('dotenv').config();
const path = require('path');
const express = require('express');
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use(express.json({ limit: '100kb' }));
app.get('/healthz', (req, res) => res.json({ ok: true, db: db.ready }));
app.use('/api', (req, res, next) => (db.ready ? next() : res.status(503).json({ error: 'db_unavailable' })), routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Пользователю — только понятные сообщения, без stack trace
app.use((err, req, res, next) => {
  if (err.user) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Некорректный запрос' });
  console.error('Ошибка:', err.code || err.message);
  res.status(500).json({ error: 'server_error' });
});

async function boot() {
  try {
    await db.init();
    db.ready = true;
    await db.cleanup();
    console.log('База данных готова');
  } catch (e) {
    console.error('БД недоступна, повтор через 5 с:', e.code || e.message);
    setTimeout(boot, 5000);
  }
}
if (!process.env.DATABASE_URL) console.warn('Внимание: переменная DATABASE_URL не задана');
app.listen(PORT, () => { console.log(`PEREMENA запущен на порту ${PORT}`); boot(); });
setInterval(() => { if (db.ready) db.cleanup().catch((e) => console.error('cleanup:', e.code || e.message)); }, 6 * 60 * 60 * 1000);

const { Pool } = require('pg');
const url = process.env.DATABASE_URL || '';
const local = !url || /localhost|127\.0\.0\.1/.test(url);
const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5, connectionTimeoutMillis: 10000 });
pool.on('error', (e) => console.error('pg pool:', e.code || e.message));

const CLASS = process.env.CLASS_NAME || '9-В';
const TZ = process.env.TZ_NAME || 'Asia/Bishkek';
const STUDENTS = ['Адылбекова Адинай','Айтыкеева Гулсун','Ашымов Али','Багышбаев Динислам','Баратов Эмир','Бахтиярова Амина','Беков Бэйэл','Бектемирова Сауле','Бектенов Баяман','Джумабаев Нурэл','Дуйшобаева Элина','Жакыпов Ибрахим','Жолчубеков Байел','Жумаматова Саида','Жусупова Альбина','Калыбеков Барсбек','Койчубекова Жаныл','Кыдырбекова Айбийке','Максатбекова Надиха','Мамадияров Элдос','Мамажанов Руслан','Мирланбеков Куттубек','Мунайбасова Сезим','Нурбекова Феруза','Сазанова Айдана','Суеркулова Раяна','Табылдыев Нурислам','Таласова Айдеми','Тилеков Нурэл','Уланбекова Амина','Умотбекова Айзирек','Чолпонбаев Чынгыз','Шайлообеков Умар','Эркинов Нурислам'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, class_name)
);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  lesson_date DATE NOT NULL,
  class_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE (lesson_date, class_name)
);
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present BOOLEAN,
  uniform BOOLEAN,
  comment TEXT NOT NULL DEFAULT '',
  UNIQUE (lesson_id, student_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  total_students INTEGER NOT NULL,
  present_count INTEGER NOT NULL,
  absent_count INTEGER NOT NULL,
  uniform_count INTEGER NOT NULL,
  no_uniform_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_lesson ON attendance(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(lesson_date);
`;

const query = (t, p) => pool.query(t, p);
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
  finally { c.release(); }
}

async function init() {
  await pool.query(SCHEMA);
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(104)');
    const { rows } = await c.query('SELECT COUNT(*)::int AS n FROM students');
    if (rows[0].n === 0) {
      await c.query('INSERT INTO students(name,class_name) SELECT n,$2 FROM unnest($1::text[]) WITH ORDINALITY AS t(n,o) ORDER BY o', [STUDENTS, CLASS]);
    }
  });
}

// Удаляются только старые занятия с отчётами и отметками (старше 30 дней). Ученики не затрагиваются.
async function cleanup() {
  const r = await pool.query("DELETE FROM lessons WHERE lesson_date < (NOW() AT TIME ZONE $1)::date - 30", [TZ]);
  if (r.rowCount) console.log(`Очистка: удалено занятий старше 30 дней: ${r.rowCount}`);
}

module.exports = { query, tx, init, cleanup, ready: false };

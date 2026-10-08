const express = require('express');
const db = require('./db');
const r = express.Router();
const TZ = process.env.TZ_NAME || 'Asia/Bishkek';
const CLASS = process.env.CLASS_NAME || '9-В';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const bad = (m, status = 400, extra) => Object.assign(new Error(m), { status, user: true, extra });
const toId = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw bad('Некорректный идентификатор'); return n; };
const tri = (v) => { if (v === null || v === undefined) return null; if (typeof v === 'boolean') return v; throw bad('Некорректное значение отметки'); };
const toName = (v) => { if (typeof v !== 'string') throw bad('Введите имя ученика'); const s = v.trim().replace(/\s+/g, ' '); if (s.length < 2 || s.length > 80) throw bad('Имя должно содержать от 2 до 80 символов'); return s; };

async function lessonFull(c, id) {
  const l = (await c.query(`SELECT id, to_char(lesson_date,'YYYY-MM-DD') AS lesson_date, class_name, status, finished_at,
    (SELECT id FROM reports WHERE lesson_id = lessons.id) AS report_id FROM lessons WHERE id=$1`, [id])).rows[0];
  if (!l) return null;
  const fin = l.status === 'finished';
  if (!fin) await c.query('INSERT INTO attendance(lesson_id,student_id) SELECT $1,id FROM students WHERE active ON CONFLICT DO NOTHING', [id]);
  l.rows = (await c.query(`SELECT s.id AS student_id, s.name, a.present, a.uniform, a.comment
    FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.lesson_id=$1 AND (s.active OR $2) ORDER BY s.id`, [id, fin])).rows;
  return l;
}

async function recompute(c, lessonId) {
  const { rows } = await c.query(`INSERT INTO reports(lesson_id,report_date,total_students,present_count,absent_count,uniform_count,no_uniform_count)
    SELECT l.id, l.lesson_date, COUNT(a.id), COUNT(*) FILTER (WHERE a.present), COUNT(*) FILTER (WHERE a.present IS FALSE),
      COUNT(*) FILTER (WHERE a.present AND a.uniform), COUNT(*) FILTER (WHERE a.present AND a.uniform IS FALSE)
    FROM lessons l JOIN attendance a ON a.lesson_id=l.id WHERE l.id=$1 GROUP BY l.id
    ON CONFLICT (lesson_id) DO UPDATE SET total_students=EXCLUDED.total_students, present_count=EXCLUDED.present_count,
      absent_count=EXCLUDED.absent_count, uniform_count=EXCLUDED.uniform_count, no_uniform_count=EXCLUDED.no_uniform_count
    RETURNING id`, [lessonId]);
  return rows[0].id;
}

// students
r.get('/students', wrap(async (req, res) => {
  res.json((await db.query('SELECT id,name,class_name FROM students WHERE active ORDER BY id')).rows);
}));
r.post('/students', wrap(async (req, res) => {
  const { rows } = await db.query(`INSERT INTO students(name,class_name) VALUES($1,$2)
    ON CONFLICT (name,class_name) DO UPDATE SET active=TRUE RETURNING id,name,class_name`, [toName(req.body.name), CLASS]);
  res.status(201).json(rows[0]);
}));
r.put('/students/:id', wrap(async (req, res) => {
  const { rows } = await db.query('UPDATE students SET name=$1 WHERE id=$2 AND active RETURNING id,name,class_name', [toName(req.body.name), toId(req.params.id)]);
  if (!rows[0]) throw bad('Ученик не найден', 404);
  res.json(rows[0]);
}));
r.delete('/students/:id', wrap(async (req, res) => {
  const n = (await db.query('UPDATE students SET active=FALSE WHERE id=$1', [toId(req.params.id)])).rowCount;
  if (!n) throw bad('Ученик не найден', 404);
  res.json({ ok: true });
}));

// lessons
r.get('/lessons', wrap(async (req, res) => {
  res.json((await db.query(`SELECT id, to_char(lesson_date,'YYYY-MM-DD') AS lesson_date, status FROM lessons ORDER BY lesson_date DESC LIMIT 60`)).rows);
}));
r.get('/lessons/today', wrap(async (req, res) => {
  const row = (await db.query('SELECT id FROM lessons WHERE lesson_date=$1 AND class_name=$2', [today(), CLASS])).rows[0];
  res.json(row ? await db.tx((c) => lessonFull(c, row.id)) : null);
}));
r.post('/lessons', wrap(async (req, res) => {
  const row = (await db.query(`INSERT INTO lessons(lesson_date,class_name) VALUES($1,$2)
    ON CONFLICT (lesson_date,class_name) DO UPDATE SET class_name=EXCLUDED.class_name RETURNING id`, [today(), CLASS])).rows[0];
  res.json(await db.tx((c) => lessonFull(c, row.id)));
}));
r.get('/lessons/:id', wrap(async (req, res) => {
  const l = await db.tx((c) => lessonFull(c, toId(req.params.id)));
  if (!l) throw bad('Занятие не найдено', 404);
  res.json(l);
}));
r.put('/lessons/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const recs = req.body.records;
  if (!Array.isArray(recs) || recs.length === 0 || recs.length > 200) throw bad('Некорректный список отметок');
  const sid = [], pr = [], un = [], cm = [];
  for (const x of recs) {
    if (!x || typeof x !== 'object') throw bad('Некорректная отметка');
    sid.push(toId(x.student_id)); pr.push(tri(x.present)); un.push(tri(x.uniform));
    const c = x.comment == null ? '' : x.comment;
    if (typeof c !== 'string' || c.length > 200) throw bad('Комментарий не длиннее 200 символов');
    cm.push(c.trim());
  }
  await db.tx(async (c) => {
    const l = (await c.query('SELECT status FROM lessons WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!l) throw bad('Занятие не найдено', 404);
    await c.query(`UPDATE attendance a SET present=v.present, uniform=v.uniform, comment=v.comment
      FROM unnest($2::int[],$3::boolean[],$4::boolean[],$5::text[]) AS v(student_id,present,uniform,comment)
      WHERE a.lesson_id=$1 AND a.student_id=v.student_id`, [id, sid, pr, un, cm]);
    if (l.status === 'finished') await recompute(c, id);
  });
  res.json({ ok: true });
}));
r.post('/lessons/:id/finish', wrap(async (req, res) => {
  const id = toId(req.params.id);
  const mark = req.body.markRestAbsent === true;
  const reportId = await db.tx(async (c) => {
    const l = (await c.query('SELECT status FROM lessons WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!l) throw bad('Занятие не найдено', 404);
    if (l.status === 'active') await c.query('INSERT INTO attendance(lesson_id,student_id) SELECT $1,id FROM students WHERE active ON CONFLICT DO NOTHING', [id]);
    const un = (await c.query(`SELECT s.name FROM attendance a JOIN students s ON s.id=a.student_id
      WHERE a.lesson_id=$1 AND a.present IS NULL AND s.active ORDER BY s.id`, [id])).rows.map((x) => x.name);
    if (un.length) {
      if (!mark) throw bad('Остались неотмеченные ученики', 409, { unmarked: un });
      await c.query('UPDATE attendance SET present=FALSE WHERE lesson_id=$1 AND present IS NULL', [id]);
    }
    await c.query("UPDATE lessons SET status='finished', finished_at=COALESCE(finished_at,NOW()) WHERE id=$1", [id]);
    return recompute(c, id);
  });
  res.json({ ok: true, report_id: reportId });
}));

// reports
const REP = `SELECT id, lesson_id, to_char(report_date,'YYYY-MM-DD') AS report_date, to_char(report_date + 30,'YYYY-MM-DD') AS expires_at,
  total_students, present_count, absent_count, uniform_count, no_uniform_count FROM reports`;
r.get('/reports', wrap(async (req, res) => { res.json((await db.query(REP + ' ORDER BY report_date DESC')).rows); }));
r.get('/reports/:id', wrap(async (req, res) => {
  const rep = (await db.query(REP + ' WHERE id=$1', [toId(req.params.id)])).rows[0];
  if (!rep) throw bad('Отчёт не найден', 404);
  rep.rows = (await db.query(`SELECT s.id AS student_id, s.name, a.present, a.uniform, a.comment
    FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.lesson_id=$1 ORDER BY s.id`, [rep.lesson_id])).rows;
  res.json(rep);
}));

// statistics
r.get('/statistics', wrap(async (req, res) => {
  const t = (await db.query(`SELECT (SELECT COUNT(*) FROM lessons WHERE status='finished')::int AS lessons,
    COALESCE(SUM(present_count),0)::int AS visits, COALESCE(SUM(absent_count),0)::int AS absences,
    COALESCE(SUM(no_uniform_count),0)::int AS no_uniform FROM reports`)).rows[0];
  const st = (await db.query(`SELECT s.id, s.name, COUNT(*) FILTER (WHERE a.present)::int AS present,
    COUNT(*) FILTER (WHERE a.present IS NOT NULL)::int AS total
    FROM students s LEFT JOIN (attendance a JOIN lessons l ON l.id=a.lesson_id AND l.status='finished') ON a.student_id=s.id
    WHERE s.active GROUP BY s.id ORDER BY s.id`)).rows;
  const students = st.map((x) => ({ ...x, percent: x.total ? Math.round((100 * x.present) / x.total) : null }));
  students.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.id - b.id);
  const all = t.visits + t.absences;
  res.json({ ...t, percent: all ? Math.round((100 * t.visits) / all) : null, students });
}));

module.exports = r;

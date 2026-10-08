const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => d.split('-').reverse().join('.');
const longDate = () => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Bishkek' }).replace(/\s?г\.?$/, '');
const NET = 'Не удалось подключиться к серверу.<br><br>Проверьте интернет-соединение<br>и попробуйте ещё раз.';
const S = { view: 'home', lesson: null, dirty: new Set(), q: '', chain: Promise.resolve(), rid: null, back: 'history', rep: null, today: null, students: [] };

async function api(path, o = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined, keepalive: !!o.keepalive });
  } catch { throw { net: true }; }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) { if (res.status >= 500) throw { net: true }; throw { status: res.status, message: data && data.error, data }; }
  return data;
}
function toast(m, t = 'ok') {
  const e = document.createElement('div');
  e.className = 'toast ' + t; e.textContent = (t === 'ok' ? '✓ ' : '⚠️ ') + m;
  $('#toasts').append(e);
  setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 300); }, 2200);
}
const fail = (e) => toast(e.net ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : e.message || 'Ошибка', 'err');

function modal(title, body, btns) {
  return new Promise((res) => {
    const m = document.createElement('div'); m.className = 'ov';
    m.innerHTML = `<div class="dlg"><h3>${title}</h3><div>${body}</div>${btns.map((b, i) => `<button class="btn ${b.c || ''}" data-i="${i}">${b.t}</button>`).join('')}</div>`;
    m.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b || e.target === m) { m.remove(); res(b ? btns[b.dataset.i].v : 0); } };
    document.body.append(m);
  });
}
const openSheet = (h) => { const s = $('#sheet'); s.innerHTML = `<div class="bd" data-act="close"></div><div class="pn"><i class="grab"></i>${h}</div>`; requestAnimationFrame(() => s.classList.add('open')); };
const closeSheet = () => $('#sheet').classList.remove('open');

// theme
const setTheme = (t) => { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); $('#theme').textContent = t === 'dark' ? '☀️' : '🌙'; $('#theme').title = t === 'dark' ? 'Светлая тема' : 'Тёмная тема'; };
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));

// counters
function counts(rows) {
  const c = { total: rows.length, p: 0, a: 0, un: 0, u: 0, nu: 0 };
  rows.forEach((r) => { if (r.present === true) { c.p++; if (r.uniform === true) c.u++; if (r.uniform === false) c.nu++; } else if (r.present === false) c.a++; else c.un++; });
  return c;
}
const summary = (c) => `<div class="sum"><div>👥 Всего <b>${c.total}</b></div><div>🟢 Пришли <b>${c.p}</b></div><div>🔴 Не пришли <b>${c.a}</b></div><div>👕 С формой <b>${c.u}</b></div><div>⚠️ Без формы <b>${c.nu}</b></div></div>`;

// ---------- saving ----------
function setSave(s) { const e = $('#save'); if (!e) return; e.className = 'sv ' + s; e.textContent = s === 'saving' ? 'Сохранение…' : s === 'err' ? '⚠️ Не сохранено' : '✓ Сохранено'; }
function queueSave() { setSave('saving'); clearTimeout(S.t); S.t = setTimeout(() => flush().catch(() => {}), 700); }
function flush(ka) {
  clearTimeout(S.t);
  S.chain = S.chain.catch(() => {}).then(async () => {
    if (!S.dirty.size || !S.lesson) return;
    const ids = [...S.dirty]; S.dirty.clear();
    const records = ids.map((id) => { const r = S.lesson.rows.find((x) => x.student_id === id); return { student_id: id, present: r.present, uniform: r.uniform, comment: r.comment || '' }; });
    try { await api(`/lessons/${S.lesson.id}`, { method: 'PUT', body: { records }, keepalive: ka }); if (!S.dirty.size) setSave('ok'); }
    catch (e) { ids.forEach((i) => S.dirty.add(i)); setSave('err'); throw e; }
  });
  return S.chain;
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.dirty.size) flush(true).catch(() => {}); });

// ---------- views ----------
const sk = () => '<div class="sk"></div>'.repeat(5);
const empty = (i, t, s) => `<div class="empty"><i>${i}</i><h3>${t}</h3><p>${s}</p></div>`;
const views = {
  async home() {
    const l = (S.today = await api('/lessons/today'));
    const c = !l ? ['🏃', 'Новое занятие', 'Начать отмечать сегодняшний урок'] : l.status === 'active' ? ['🏃', 'Продолжить занятие', 'Отметки сохранены, можно продолжить'] : ['✅', 'Занятие завершено', 'Открыть отчёт за сегодня'];
    return `<section class="hero"><p>Сегодня</p><b>${longDate()}</b><p>Физкультура • 9-В класс</p></section>
    <div class="grid"><button class="tile main" data-act="newLesson"><i>${c[0]}</i><b>${c[1]}</b><small>${c[2]}</small></button>
    <button class="tile" data-act="nav" data-v="history"><i>📊</i><b>История</b><small>Предыдущие отчёты</small></button>
    <button class="tile" data-act="nav" data-v="students"><i>👥</i><b>Ученики</b><small>Список класса</small></button>
    <button class="tile" data-act="nav" data-v="stats"><i>📈</i><b>Статистика</b><small>Посещаемость</small></button>
    <button class="tile" data-act="theme"><i>${document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙'}</i><b>Тема</b><small>Светлая / тёмная</small></button></div>`;
  },
  async lesson() {
    const L = S.lesson, fin = L.status === 'finished';
    return `<div class="lh"><div><h2>${fin ? 'Исправление' : 'Физкультура'}</h2><p>${fmt(L.lesson_date)}</p><p>9-В класс • ${L.rows.length} учеников</p></div><span id="save" class="sv ok">✓ Сохранено</span></div>
    ${fin ? '<div class="note">✏️ Вы исправляете завершённый отчёт. Изменения сохраняются сразу.</div>' : ''}
    <div id="cnt" class="cnt sticky"></div>
    <div class="quick"><button class="chip" data-act="all" data-f="present" data-v="1">✅ Все пришли</button><button class="chip" data-act="all" data-f="present" data-v="0">❌ Все отсутствуют</button><button class="chip" data-act="all" data-f="uniform" data-v="1">👕 У всех есть форма</button></div>
    <input id="q" class="srch" type="search" placeholder="🔎 Поиск ученика" value="${esc(S.q)}" autocomplete="off">
    <div id="list"></div>
    <button class="btn big" data-act="${fin ? 'saveEdit' : 'finish'}">${fin ? '💾 Сохранить исправления' : '✅ Завершить занятие'}</button>`;
  },
  async history() {
    const list = (S.reports = await api('/reports'));
    if (!list.length) return '<h2>📊 История</h2>' + empty('📊', 'Отчётов пока нет', 'Завершите первое занятие,<br>и здесь появится история.');
    return `<h2>📊 История</h2><p>Отчёты хранятся 30 дней</p><input id="q" class="srch" type="search" placeholder="🔎 Поиск по дате, например 08.10" autocomplete="off"><div id="hl"></div>`;
  },
  async report() {
    const r = (S.rep = await api('/reports/' + S.rid));
    return `<button class="chip" data-act="back">← Назад</button>${reportHtml(r)}
    <button class="btn pri" data-act="copy">📋 Скопировать отчёт</button><button class="btn" data-act="edit">✏️ Исправить</button>`;
  },
  async students() {
    S.students = await api('/students');
    return `<h2>👥 Ученики</h2><p>${S.students.length} учеников • 9-В класс</p>
    <div class="srow" style="margin:10px 0"><input id="nn" class="in" placeholder="Фамилия Имя нового ученика" maxlength="80"><button class="mini" data-act="addStudent" aria-label="Добавить">➕</button></div>
    <input id="q" class="srch" type="search" placeholder="🔎 Поиск ученика" autocomplete="off"><div id="sl"></div>`;
  },
  async stats() {
    const s = (S.stats = await api('/statistics'));
    if (!s.lessons) return '<h2>📈 Статистика</h2>' + empty('📈', 'Данных пока нет', 'Статистика появится после<br>первого завершённого занятия.');
    return `<h2>📈 Статистика</h2><p>За доступный период (до 30 дней)</p>
    <div class="grid" style="margin:12px 0"><div class="tile"><b style="font-size:30px">${s.lessons}</b><small>Всего занятий</small></div><div class="tile"><b style="font-size:30px">${s.percent}%</b><small>Посещаемость</small></div>
    <div class="tile"><b style="font-size:30px">${s.visits}</b><small>Всего посещений</small></div><div class="tile"><b style="font-size:30px">${s.absences}</b><small>Пропусков</small></div>
    <div class="tile main" style="min-height:90px"><b style="font-size:30px">${s.no_uniform}</b><small>Раз без формы</small></div></div>
    <h3>Рейтинг посещаемости</h3><input id="q" class="srch" type="search" placeholder="🔎 Поиск ученика" autocomplete="off"><div id="rk"></div>`;
  },
};

function reportHtml(r) {
  const R = r.rows, A = R.filter((x) => x.present === false), NU = R.filter((x) => x.present && x.uniform === false), P = R.filter((x) => x.present), U = R.filter((x) => x.present && x.uniform === true), UN = R.filter((x) => x.present && x.uniform === null);
  const sec = (t, a) => a.length ? `<div class="sec"><h4>${t} (${a.length})</h4><ol>${a.map((x) => `<li>${esc(x.name)}${x.comment ? `<small>💬 ${esc(x.comment)}</small>` : ''}</li>`).join('')}</ol></div>` : '';
  return `<div class="rep"><div class="hd"><div class="brand">📍 PEREMENA</div><p>№104 ЖББ мектеби • 9-В класс</p><b>📅 ${fmt(r.report_date)}</b><p>Хранится до ${fmt(r.expires_at)}</p></div>
  ${summary({ total: r.total_students, p: r.present_count, a: r.absent_count, u: r.uniform_count, nu: r.no_uniform_count })}
  ${sec('🔴 Не пришли', A)}${sec('⚠️ Без формы', NU)}${sec('🟢 Пришли', P)}${sec('👕 С формой', U)}${sec('❔ Форма не отмечена', UN)}</div>`;
}
function reportText(r) {
  const R = r.rows, L = (t, a) => a.length ? `\n━━━━━━━━━━━━━━━━\n\n${t}\n\n${a.map((x, i) => `${i + 1}. ${x.name}${x.comment ? ' (' + x.comment + ')' : ''}`).join('\n')}\n` : '';
  return `━━━━━━━━━━━━━━━━\n\n📍 PEREMENA\n\n№104 ЖББ мектеби\n9-В класс\n\n📅 ${fmt(r.report_date)}\n\n━━━━━━━━━━━━━━━━\n\n👥 Всего: ${r.total_students}\n🟢 Пришли: ${r.present_count}\n🔴 Не пришли: ${r.absent_count}\n\n👕 С формой: ${r.uniform_count}\n⚠️ Без формы: ${r.no_uniform_count}\n`
    + L('🔴 НЕ ПРИШЛИ', R.filter((x) => x.present === false)) + L('⚠️ БЕЗ ФОРМЫ', R.filter((x) => x.present && x.uniform === false)) + '\n━━━━━━━━━━━━━━━━';
}

// ---------- lesson painting ----------
function paintCounters() {
  const c = counts(S.lesson.rows), e = $('#cnt'); if (!e) return;
  e.innerHTML = `<div><b>${c.total}</b><span>Всего</span></div><div class="g"><b>${c.p}</b><span>Пришли</span></div><div class="r"><b>${c.a}</b><span>Не пришли</span></div>
  <div class="g"><b>${c.u}</b><span>С формой</span></div><div class="y"><b>${c.nu}</b><span>Без формы</span></div><div><b>${c.un}</b><span>Не отмечены</span></div>`;
}
function paintList() {
  const q = S.q.trim().toLowerCase(), e = $('#list'); if (!e) return;
  const html = S.lesson.rows.map((r, i) => ({ r, i })).filter((x) => x.r.name.toLowerCase().includes(q)).map(({ r, i }) => {
    const p = r.present, u = r.uniform, id = r.student_id;
    const tag = p === true ? '<span class="tag ok">🟢 Пришёл</span>' : p === false ? '<span class="tag bad">🔴 Не пришёл</span>' : '<span class="tag">⚪ Не отмечен</span>';
    const ut = p === true && u === false ? '<span class="tag warn">⚠️ Нет формы</span>' : p === true && u === true ? '<span class="tag">👕 Есть форма</span>' : '';
    return `<div class="card ${p === true ? 'ok' : p === false ? 'bad' : ''}"><div class="top2" data-act="sheet" data-id="${id}"><span class="num">${String(i + 1).padStart(2, '0')}</span>
    <div class="nm">${esc(r.name)}${r.comment ? `<small>💬 ${esc(r.comment)}</small>` : ''}</div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">${tag}${ut}</div></div>
    <div class="seg"><button class="${p === true ? 'on ok' : ''}" data-act="set" data-id="${id}" data-f="present" data-v="1">🟢 Пришёл</button><button class="${p === false ? 'on bad' : ''}" data-act="set" data-id="${id}" data-f="present" data-v="0">🔴 Нет</button></div>
    <div class="seg ${p === false ? 'dim' : ''}"><span class="lbl">Форма</span><button class="${u === true ? 'on ok' : ''}" data-act="set" data-id="${id}" data-f="uniform" data-v="1">👕 Есть</button><button class="${u === false ? 'on bad' : ''}" data-act="set" data-id="${id}" data-f="uniform" data-v="0">❌ Нет</button></div></div>`;
  }).join('');
  e.innerHTML = html || empty('🔎', 'Никого не найдено', 'Проверьте написание фамилии.');
}
function setField(id, f, v, quiet) {
  const r = S.lesson.rows.find((x) => x.student_id === id); if (!r) return;
  const nv = r[f] === v ? null : v; r[f] = nv; S.dirty.add(id);
  if (!quiet) { paintCounters(); paintList(); queueSave(); if (f === 'present' && nv !== null) toast(nv ? 'Ученик отмечен как присутствующий' : 'Ученик отмечен как отсутствующий'); }
}
function bulk(f, v) {
  S.lesson.rows.forEach((r) => { if (f === 'uniform' && r.present === false) return; if (r[f] !== v) { r[f] = v; S.dirty.add(r.student_id); } });
  paintCounters(); paintList(); queueSave();
  toast(f === 'present' ? (v ? 'Все отмечены как присутствующие' : 'Все отмечены как отсутствующие') : 'У всех пришедших форма есть');
}

// student sheet
let T = null;
function sheetHtml() {
  const b = (f, v, t) => `<button class="${T[f] === v ? 'on ' + (v ? 'ok' : 'bad') : ''}" data-act="shset" data-f="${f}" data-v="${v ? 1 : 0}">${t}</button>`;
  return `<h3>${esc(T.name)}</h3><h4>Посещение</h4><div class="seg">${b('present', true, '🟢 Пришёл')}${b('present', false, '🔴 Отсутствует')}</div>
  <h4>Спортивная форма</h4><div class="seg">${b('uniform', true, '👕 Есть')}${b('uniform', false, '❌ Нет')}</div>
  <h4>Комментарий</h4><input id="cm" class="in" maxlength="200" placeholder="забыл форму, справка, ушёл раньше…" value="${esc(T.comment)}">
  <button class="btn pri" data-act="shsave">Сохранить</button>`;
}
function studentSheet(id) { const r = S.lesson.rows.find((x) => x.student_id === id); T = { ...r }; openSheet(sheetHtml()); }

// ---------- render / nav ----------
async function render() {
  const v = $('#view');
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === (S.view === 'report' ? 'history' : S.view)));
  if (S.view !== 'lesson') v.innerHTML = sk();
  try {
    v.innerHTML = await views[S.view](); window.scrollTo(0, 0);
    if (S.view === 'lesson') { paintCounters(); paintList(); }
    if (S.view === 'history') paintHistory();
    if (S.view === 'students') paintStudents();
    if (S.view === 'stats') paintRank();
  } catch (e) {
    v.innerHTML = e.net ? `<div class="empty"><i>📡</i><p>${NET}</p><button class="btn pri" data-act="retry">Повторить</button></div>` : empty('⚠️', 'Что-то пошло не так', e.message || '') ;
  }
}
const go = (v) => { S.view = v; S.q = ''; render(); };
function paintHistory() {
  const e = $('#hl'); if (!e) return; const q = ($('#q').value || '').trim();
  const a = S.reports.filter((r) => fmt(r.report_date).includes(q));
  e.innerHTML = a.map((r) => `<button class="hrow" data-act="openRep" data-id="${r.id}"><b>📍 ${fmt(r.report_date)}</b><p>${r.present_count} пришли • ${r.absent_count} отсутствуют</p><p>${r.uniform_count} с формой • ${r.no_uniform_count} без формы</p><small>Хранится до ${fmt(r.expires_at)}</small></button>`).join('') || empty('🔎', 'Ничего не найдено', 'Попробуйте другую дату.');
}
function paintStudents() {
  const e = $('#sl'); if (!e) return; const q = ($('#q').value || '').trim().toLowerCase();
  e.innerHTML = S.students.map((s, i) => ({ s, i })).filter((x) => x.s.name.toLowerCase().includes(q)).map(({ s, i }) => `<div class="card srow"><span class="num">${String(i + 1).padStart(2, '0')}</span><div class="nm">${esc(s.name)}</div>
  <button class="mini" data-act="editStudent" data-id="${s.id}" aria-label="Изменить">✏️</button><button class="mini" data-act="delStudent" data-id="${s.id}" aria-label="Удалить">🗑️</button></div>`).join('') || empty('🔎', 'Никого не найдено', 'Проверьте написание фамилии.');
}
function paintRank() {
  const e = $('#rk'); if (!e) return; const q = ($('#q').value || '').trim().toLowerCase();
  e.innerHTML = S.stats.students.filter((s) => s.name.toLowerCase().includes(q)).map((s) => `<div class="card"><div class="srow"><div class="nm">${esc(s.name)}<small>Посещаемость: ${s.percent === null ? '—' : s.percent + '%'} (${s.present} из ${s.total})</small></div></div><div class="bar"><span style="width:${s.percent || 0}%"></span></div></div>`).join('') || empty('🔎', 'Никого не найдено', 'Проверьте написание фамилии.');
}

// ---------- actions ----------
async function openLesson(l) { S.lesson = l; S.dirty.clear(); S.q = ''; S.view = 'lesson'; render(); }
async function openReport(id, back) { S.rid = id; S.back = back; S.view = 'report'; render(); }
async function finish() {
  try {
    await flush();
    const rows = S.lesson.rows.map((r) => ({ ...r })), un = rows.filter((r) => r.present === null); let mark = false;
    if (un.length) {
      const v = await modal('⚠️ Остались неотмеченные ученики', `<p>Пожалуйста, проверьте:</p><ul class="ul">${un.map((r) => `<li>${esc(r.name)}</li>`).join('')}</ul>`, [{ t: 'Вернуться и проверить', v: 0, c: 'pri' }, { t: 'Отметить остальных как отсутствующих', v: 1, c: 'bad' }]);
      if (!v) return; mark = true; rows.forEach((r) => { if (r.present === null) r.present = false; });
    }
    const ok = await modal('Завершить занятие?', `<p>После завершения будет создан итоговый отчёт за ${fmt(S.lesson.lesson_date)}.</p>${summary(counts(rows))}`, [{ t: 'Завершить', v: 1, c: 'pri' }, { t: 'Отмена', v: 0 }]);
    if (!ok) return;
    const r = await api(`/lessons/${S.lesson.id}/finish`, { method: 'POST', body: { markRestAbsent: mark } });
    toast('Занятие завершено'); toast('Отчёт сохранён'); S.lesson = null; openReport(r.report_id, 'home');
  } catch (e) { fail(e); }
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset, id = Number(d.id);
  try {
    switch (d.act) {
      case 'theme': setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (S.view === 'home') render(); break;
      case 'nav':
        if (d.v === 'lesson') { if (S.lesson) { S.view = 'lesson'; render(); } else newLesson(); } else go(d.v); break;
      case 'newLesson': newLesson(); break;
      case 'retry': render(); break;
      case 'back': go(S.back); break;
      case 'set': setField(id, d.f, d.v === '1'); break;
      case 'all': bulk(d.f, d.v === '1'); break;
      case 'sheet': studentSheet(id); break;
      case 'shset': T[d.f] = T[d.f] === (d.v === '1') ? null : d.v === '1'; T.comment = $('#cm').value; $('#sheet .pn').innerHTML = '<i class="grab"></i>' + sheetHtml(); break;
      case 'shsave': {
        const r = S.lesson.rows.find((x) => x.student_id === T.student_id);
        r.present = T.present; r.uniform = T.uniform; r.comment = $('#cm').value.trim(); S.dirty.add(r.student_id);
        closeSheet(); paintCounters(); paintList(); queueSave(); toast('Данные ученика сохранены'); break;
      }
      case 'close': closeSheet(); break;
      case 'finish': finish(); break;
      case 'saveEdit': await flush(); toast('Отчёт сохранён'); S.lesson = null; openReport(S.rid, S.back); break;
      case 'openRep': openReport(id, 'history'); break;
      case 'copy':
        try { await navigator.clipboard.writeText(reportText(S.rep)); toast('Отчёт скопирован'); }
        catch { const t = document.createElement('textarea'); t.value = reportText(S.rep); document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('Отчёт скопирован'); }
        break;
      case 'edit': {
        const ok = await modal('Исправить отчёт?', `<p>Вы изменяете отчёт за ${fmt(S.rep.report_date)}. Изменения сразу обновятся в базе данных.</p>`, [{ t: 'Исправить', v: 1, c: 'pri' }, { t: 'Отмена', v: 0 }]);
        if (ok) openLesson(await api('/lessons/' + S.rep.lesson_id)); break;
      }
      case 'addStudent': {
        const inp = $('#nn'); await api('/students', { method: 'POST', body: { name: inp.value } }); toast('Ученик добавлен'); render(); break;
      }
      case 'editStudent': {
        const s = S.students.find((x) => x.id === id); S.editId = id;
        openSheet(`<h3>Изменить ученика</h3><input id="en" class="in" maxlength="80" value="${esc(s.name)}" style="margin-top:12px"><button class="btn pri" data-act="saveStudent">Сохранить</button>`); break;
      }
      case 'saveStudent': await api('/students/' + S.editId, { method: 'PUT', body: { name: $('#en').value } }); closeSheet(); toast('Имя обновлено'); render(); break;
      case 'delStudent': {
        const s = S.students.find((x) => x.id === id);
        const ok = await modal('Убрать из списка?', `<p>${esc(s.name)} исчезнет из новых занятий. Старые отчёты сохранятся.</p>`, [{ t: 'Убрать', v: 1, c: 'bad' }, { t: 'Отмена', v: 0 }]);
        if (ok) { await api('/students/' + id, { method: 'DELETE' }); toast('Ученик убран из списка'); render(); } break;
      }
    }
  } catch (e) { if (e.status === 409) toast(e.message, 'err'); else fail(e); setSave('err'); if (!S.dirty.size) setSave('ok'); }
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  S.q = e.target.value; ({ lesson: paintList, history: paintHistory, students: paintStudents, stats: paintRank })[S.view]();
});
async function newLesson() {
  try {
    if (S.today && S.today.status === 'finished' && S.today.report_id) return openReport(S.today.report_id, 'home');
    const l = await api('/lessons', { method: 'POST' });
    if (l.status === 'finished') return openReport(l.report_id, 'home');
    openLesson(l);
  } catch (e) { fail(e); }
}
render();

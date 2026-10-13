// ═══════════════════════════════════════════════════════════
// ODOO → ГРАФІК: автоматичний факт продажів менеджерів
// ═══════════════════════════════════════════════════════════
// Раз на годину забирає з Odoo підтверджені замовлення по продавцю (user_id)
// і дню (за київським часом) та пише їх у daily_revenue_detail з
// source='odoo'. Логіка відбору — та сама, що в дашбордах Odoo:
//   РЗПК  — дашборд «Відділ РЗПК › Загальний» (дата = date_order)
//   ГБ    — дашборд «Горячий Відділ › Загальний» (дата = create_date)
// Ручні суми (source='manual' або старі рядки без source) НЕ перезаписуються,
// якщо явно не попросили overwrite=true (кнопка/запит з вибраним періодом).
//
// Змінні Railway: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY.
// Без них модуль просто вимкнений — графік працює як раніше.

const TZ = 'Europe/Kyiv';

// Правила по відділах графіка (code відділу → як рахувати в Odoo)
const RZPK_RULE = {
  label: 'РЗПК',
  dateField: 'date_order',
  domain: [
    ['state', '=', 'sale'],
    ['team_id', 'in', [6, 10, 11]],
    ['opportunity_id.source_id', 'in', [13, 10, 11, 21]],
    ['opportunity_id.stage_id', 'not in', [8, 9, 10, 11, 24]],
  ],
};
const HOT_RULE = {
  label: 'ГБ',
  dateField: 'create_date',
  domain: [
    ['state', '=', 'sale'],
    ['team_id', 'in', [5]],
    ['opportunity_id.source_id', 'in', [4, 15, 16, 19, 20]],
    ['opportunity_id.ikorka_additional_discount', 'not ilike', 'Паста_299'],
  ],
};
// Філія Вінниця (vin_op): менеджери з міткою «Вінниця» в Odoo продають у тих
// самих командах і з тих самих джерел, що РЗПК — правило те саме, але окремий
// запит/підсумок, щоб у журналі синхронізації Вінниця йшла окремим рядком.
const VIN_RULE = { ...RZPK_RULE, label: 'Вінниця' };
const DEPT_RULES = {
  vin_op: VIN_RULE,
  rzpk: RZPK_RULE,
  retail: RZPK_RULE,
  wholesale: RZPK_RULE,
  resellers: RZPK_RULE,
  hot: HOT_RULE,
};

function isConfigured() {
  return !!(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_LOGIN && process.env.ODOO_API_KEY);
}

// ── JSON-RPC ─────────────────────────────────────────────
let cachedUid = null;
async function rpc(service, method, args) {
  const url = process.env.ODOO_URL.replace(/\/+$/, '') + '/jsonrpc';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) {
    const msg = (j.error.data && j.error.data.message) || j.error.message || 'Odoo error';
    throw new Error(msg);
  }
  return j.result;
}
async function uid() {
  if (cachedUid) return cachedUid;
  const r = await rpc('common', 'authenticate', [process.env.ODOO_DB, process.env.ODOO_LOGIN, process.env.ODOO_API_KEY, {}]);
  if (!r) throw new Error('Odoo: невірний логін або API-ключ (можливо, ключ прострочений)');
  cachedUid = r;
  return r;
}
async function call(model, method, args, kwargs = {}) {
  const u = await uid();
  try {
    return await rpc('object', 'execute_kw', [process.env.ODOO_DB, u, process.env.ODOO_API_KEY, model, method, args, kwargs]);
  } catch (e) {
    cachedUid = null; // ключ могли перевипустити — наступний раз автентифікуємось наново
    throw e;
  }
}

// ── Дати: Київ ↔ UTC ─────────────────────────────────────
// 'YYYY-MM-DD HH:MM:SS' (UTC з Odoo) → 'YYYY-MM-DD' за Києвом
function kyivDay(odooUtc) {
  const d = new Date(odooUtc.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
// Зсув Києва від UTC (у хвилинах) у конкретний момент
function kyivOffsetMin(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}
// Початок київської доби 'YYYY-MM-DD' → 'YYYY-MM-DD HH:MM:SS' в UTC для домену Odoo
function kyivDayStartUtc(day) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const off = kyivOffsetMin(new Date(guess.getTime() - 3 * 3600 * 1000));
  const t = new Date(guess.getTime() - off * 60000);
  return t.toISOString().replace('T', ' ').slice(0, 19);
}
function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function todayKyiv() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// ── Міграції (ідемпотентні) ──────────────────────────────
async function migrate(q) {
  await q(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS odoo_user_id INTEGER`);
  await q(`ALTER TABLE daily_revenue_detail ADD COLUMN IF NOT EXISTS source TEXT`);
  await q(`CREATE TABLE IF NOT EXISTS odoo_sync_log (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    date_from DATE, date_to DATE,
    overwrite BOOLEAN DEFAULT false,
    trigger TEXT,
    ok BOOLEAN,
    written INTEGER DEFAULT 0,
    skipped_manual INTEGER DEFAULT 0,
    message TEXT
  )`);
}

// ── Синхронізація ────────────────────────────────────────
// Повертає { written, skipped_manual, zeroed, by_dept }
let running = false;
async function syncRange(q, dateFrom, dateTo, { overwrite = false, trigger = 'manual' } = {}) {
  if (!isConfigured()) throw new Error('Odoo не налаштовано (немає змінних ODOO_* у Railway)');
  if (running) throw new Error('Синхронізація вже йде, спробуйте за хвилину');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
    throw new Error('Невірний період');
  }
  running = true;
  const log = await q(`INSERT INTO odoo_sync_log (date_from, date_to, overwrite, trigger) VALUES ($1,$2,$3,$4) RETURNING id`,
    [dateFrom, dateTo, overwrite, trigger]);
  const logId = log[0].id;
  const stats = { written: 0, skipped_manual: 0, zeroed: 0, by_dept: {} };
  try {
    // співробітники з прив'язкою до Odoo у відділах, для яких є правило
    const emps = await q(`
      SELECT e.id, e.odoo_user_id, d.code AS dept_code
      FROM employees e JOIN departments d ON d.id = e.department_id
      WHERE e.odoo_user_id IS NOT NULL AND d.code = ANY($1)`, [Object.keys(DEPT_RULES)]);

    // групуємо по правилу (РЗПК-відділи мають одне правило на всіх)
    const byRule = new Map();
    for (const e of emps) {
      const rule = DEPT_RULES[e.dept_code];
      if (!byRule.has(rule)) byRule.set(rule, []);
      byRule.get(rule).push(e);
    }

    const fromUtc = kyivDayStartUtc(dateFrom);
    const toUtc = kyivDayStartUtc(addDays(dateTo, 1));

    for (const [rule, list] of byRule) {
      const userIds = [...new Set(list.map(e => e.odoo_user_id))];
      const orders = await call('sale.order', 'search_read', [[
        ...rule.domain,
        ['user_id', 'in', userIds],
        [rule.dateField, '>=', fromUtc],
        [rule.dateField, '<', toUtc],
      ]], { fields: ['user_id', rule.dateField, 'amount_total'], context: { active_test: false } });

      // сума по (odoo user, київський день)
      const sums = new Map();
      for (const o of orders) {
        if (!o.user_id || !o[rule.dateField]) continue;
        const key = o.user_id[0] + '|' + kyivDay(o[rule.dateField]);
        sums.set(key, (sums.get(key) || 0) + (o.amount_total || 0));
      }

      // існуючі рядки за період — щоб не чіпати ручні і обнулити зниклі (скасовані) з Odoo
      const empIds = list.map(e => e.id);
      const existing = await q(`
        SELECT employee_id, to_char(revenue_date,'YYYY-MM-DD') AS day, amount, source
        FROM daily_revenue_detail
        WHERE employee_id = ANY($1) AND revenue_date BETWEEN $2 AND $3`, [empIds, dateFrom, dateTo]);
      const exMap = new Map(existing.map(r => [r.employee_id + '|' + r.day, r]));

      let deptTotal = 0;
      for (const e of list) {
        for (let day = dateFrom; day <= dateTo; day = addDays(day, 1)) {
          const amount = Math.round((sums.get(e.odoo_user_id + '|' + day) || 0) * 100) / 100;
          const ex = exMap.get(e.id + '|' + day);
          const isManual = ex && ex.source !== 'odoo';
          if (isManual && !overwrite) { if (amount > 0) stats.skipped_manual++; continue; }
          if (!ex && amount === 0) continue;                       // нічого не було і нема
          if (ex && ex.source === 'odoo' && parseFloat(ex.amount) === amount) { deptTotal += amount; continue; }
          await q(`
            INSERT INTO daily_revenue_detail (employee_id, revenue_date, amount, note, source, updated_at)
            VALUES ($1,$2,$3,NULL,'odoo',NOW())
            ON CONFLICT (employee_id, revenue_date)
            DO UPDATE SET amount=$3, source='odoo', updated_at=NOW()`, [e.id, day, amount]);
          if (amount === 0) stats.zeroed++; else stats.written++;
          deptTotal += amount;
        }
      }
      stats.by_dept[rule.label] = Math.round(deptTotal);
    }

    await q(`UPDATE odoo_sync_log SET finished_at=NOW(), ok=true, written=$2, skipped_manual=$3, message=$4 WHERE id=$1`,
      [logId, stats.written + stats.zeroed, stats.skipped_manual, JSON.stringify(stats.by_dept)]);
    return stats;
  } catch (e) {
    await q(`UPDATE odoo_sync_log SET finished_at=NOW(), ok=false, message=$2 WHERE id=$1`, [logId, String(e.message).slice(0, 500)]);
    throw e;
  } finally {
    running = false;
  }
}

// Період для автосинхронізації: лише поточний місяць, з 1-го числа по сьогодні.
// Попередній місяць автоматично НЕ чіпаємо: за нього вже рахується ЗП, а сума
// daily_revenue_detail підставляється новачкам як «Факт обороту», якщо РОП не
// вписав його вручну. Минулі періоди — лише вручну («Перезаписати з Odoo»).
function autoPeriod() {
  const today = todayKyiv();
  return { from: today.slice(0, 8) + '01', to: today };
}

// ── Підбір відповідності «співробітник графіка ↔ користувач Odoo» ──
// Нормалізація ПІБ: латинські «двійники» → кирилиця, і/ї/и/ы → и, є/е/э/ё → е,
// без апострофів і м'якого знака — щоб «Шелковникова»=«Шелковнікова»,
// «Віолетта»=«Виолетта», «Cвиридова» (лат. C)=«Свиридова».
const LAT2CYR = { a: 'а', c: 'с', e: 'е', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', b: 'в', h: 'н' };
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/[a-z]/g, ch => LAT2CYR[ch] || ch)
    .replace(/[ʼ'’′`ь]/g, '')
    .replace(/[іїиы]/g, 'и').replace(/[єеэё]/g, 'е')
    .replace(/[^а-яґ\s-]/g, ' ')
    .split(/\s+/).filter(Boolean);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
// 3 — прізвище й ім'я збігаються; 2 — прізвище (з точністю до 1 літери) +
// ім'я з тих самих 2 перших літер («Оля»/«Ольга», «Данило»/«Даниил»);
// 1 — лише прізвище («Ганна»/«Анна») — тільки підказка, без автоприв'язки.
// Основний порядок — «Прізвище Ім'я» з обох боків. Якщо в одному з імен слова
// переставлені («Анна Почтовик»), рахується лише повний збіг (3) — інакше
// однакові імена («Анастасія», «Вероніка») давали б хибних кандидатів.
// По батькові ігнорується.
function nameScore(a, b) {
  const A = normName(a), B = normName(b);
  if (A.length < 2 || B.length < 2) return 0;
  const [as, af] = A, [bs, bf] = B;
  if (as === bs && af === bf) return 3;
  if (as === bf && af === bs) return 3;            // переставлені слова
  const sFuzzy = as === bs || (as.length >= 5 && lev(as, bs) <= 1);
  if (!sFuzzy) return 0;
  if (af.slice(0, 2) === bf.slice(0, 2)) return 2;
  if (as === bs) return 1;
  return 0;
}
async function odooUsers() {
  return call('res.users', 'search_read', [[['share', '=', false]]], { fields: ['name', 'login', 'active'], context: { active_test: false } });
}
// Кількість підтверджених замовлень по продавцях за ~2 місяці — щоб серед
// тезок/дублікатів акаунтів вибрати того, хто реально продає.
async function recentSalesCount() {
  const from = kyivDayStartUtc(addDays(todayKyiv(), -60));
  const g = await call('sale.order', 'read_group',
    [[['state', '=', 'sale'], ['team_id', 'in', [5, 6, 10, 11]], ['date_order', '>=', from]], ['user_id'], ['user_id']],
    { lazy: false });
  const m = new Map();
  for (const r of g || []) if (r.user_id) m.set(r.user_id[0], r.__count || 0);
  return m;
}
async function suggestMatches(q) {
  const emps = await q(`
    SELECT e.id, e.name, e.odoo_user_id, e.is_active, d.code AS dept_code, d.name AS dept_name
    FROM employees e JOIN departments d ON d.id = e.department_id
    WHERE d.code = ANY($1) AND e.is_active = true
      -- звільнені (статус '-' у графіку) до початку поточного місяця не
      -- показуються — та сама логіка, що в GET /api/employees і /api/stats
      AND NOT (COALESCE((SELECT MAX(se.entry_date) FROM schedule_entries se
                         WHERE se.employee_id = e.id AND se.status = '-'),
                        DATE '9999-12-31') < $2::date)
    ORDER BY d.id, e.name`, [Object.keys(DEPT_RULES), todayKyiv().slice(0, 8) + '01']);
  const [users, sales] = await Promise.all([odooUsers(), recentSalesCount().catch(() => new Map())]);
  const byId = new Map(users.map(u => [u.id, u]));
  return emps.map(e => {
    const cands = users
      .map(u => ({ id: u.id, name: u.name, active: u.active, sales: sales.get(u.id) || 0, score: nameScore(e.name, u.name) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score || b.sales - a.sales || (b.active - a.active));
    const linked = e.odoo_user_id ? byId.get(e.odoo_user_id) : null;
    return {
      employee_id: e.id, name: e.name, dept: e.dept_name,
      odoo_user_id: e.odoo_user_id, odoo_user_name: linked ? linked.name : null,
      candidates: cands.slice(0, 6),
    };
  });
}
// Вибір для автоприв'язки: серед кандидатів з балом ≥2 — єдиний, хто має
// продажі; якщо продажів нема ні в кого — єдиний кандидат з балом ≥2.
function pickAuto(cands) {
  const good = cands.filter(c => c.score >= 2);
  const selling = good.filter(c => c.sales > 0);
  if (selling.length === 1) return selling[0];
  if (selling.length === 0 && good.length === 1) return good[0];
  return null;
}
async function autoLink(q) {
  const rows = await suggestMatches(q);
  const linked = [], ambiguous = [], notFound = [];
  for (const r of rows) {
    if (r.odoo_user_id) continue;
    const pick = pickAuto(r.candidates);
    if (pick) {
      await q(`UPDATE employees SET odoo_user_id=$1 WHERE id=$2`, [pick.id, r.employee_id]);
      linked.push({ name: r.name, odoo: pick.name });
    } else if (r.candidates.length) ambiguous.push({ name: r.name, candidates: r.candidates });
    else notFound.push(r.name);
  }
  return { linked, ambiguous, notFound };
}

// ── Дані для картки ЗП (кнопка «Підтягнути з Odoo») ─────────
// Лише ПОКАЗУЄ цифри — у salary_calc нічого не пише. Зберігає РОП сам.
// Логіка = дашборд «Відділ РЗПК › Загальний»:
//   Факт оборот = «Сумма» (замовлення 4 джерел, без стадій 8,9,10,11,24)
//   % повернень = «Заказов Возврат» / «Кол-во заказов» × 100
//                 (повернення = стадії ліда 20,21,22; дата = date_order)
const RZPK_DEPTS = ['rzpk', 'retail', 'wholesale', 'resellers', 'vin_op'];
async function salaryFacts(q, employeeId, year, month, effectiveDeptCode) {
  if (!isConfigured()) throw new Error('Odoo не підключено');
  const y = parseInt(year), m = parseInt(month);
  if (!y || !m) throw new Error('Невірний місяць');
  const emp = (await q(`SELECT id, name, odoo_user_id FROM employees WHERE id=$1`, [employeeId]))[0];
  if (!emp) throw new Error('Співробітника не знайдено');
  if (!emp.odoo_user_id) throw new Error('Не прив\'язаний до Odoo (кнопка «🔗 Odoo» → «Хто є хто»)');
  const dept = effectiveDeptCode ? await effectiveDeptCode(employeeId, y, m) : null;
  if (dept && !RZPK_DEPTS.includes(dept)) throw new Error('Для цього відділу автопідстановка поки не підтримується');
  const mStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const fromUtc = kyivDayStartUtc(mStart), toUtc = kyivDayStartUtc(nextStart);
  const uid = emp.odoo_user_id;
  const orders = await call('sale.order', 'search_read', [[
    ...RZPK_RULE.domain, ['user_id', '=', uid],
    ['date_order', '>=', fromUtc], ['date_order', '<', toUtc],
  ]], { fields: ['amount_total'] });
  const returns = await call('sale.order', 'search_count', [[
    ['state', '=', 'sale'], ['team_id', 'in', [6, 10, 11]],
    ['opportunity_id.stage_id', 'in', [20, 21, 22]], ['user_id', '=', uid],
    ['date_order', '>=', fromUtc], ['date_order', '<', toUtc],
  ]]);
  const fact = Math.round(orders.reduce((a, o) => a + (o.amount_total || 0), 0) * 100) / 100;
  const n = orders.length;
  const returnsPct = n ? Math.round(returns / n * 1000) / 10 : 0;
  // остаточні цифри — після 15-го числа наступного місяця (докапують повернення)
  const finalAfter = new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
  return { employee_id: emp.id, fact, orders: n, returns, returns_pct: returnsPct,
           as_of: new Date().toISOString(), final: todayKyiv() > finalAfter, final_after: finalAfter };
}

// ── Підключення до Express ───────────────────────────────
function mount(app, { q, requireAuth, effectiveDeptCode }) {
  migrate(q).catch(e => console.error('odoo-sync migrate:', e.message));
  // прив'язки і перезапис ручних сум — лише власник (role='owner')
  const requireOwner = (req, res, next) => requireAuth(req, res, () => {
    if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Тільки для власника' });
    next();
  });

  app.get('/api/odoo/status', requireAuth, async (req, res) => {
    try {
      const last = await q(`SELECT * FROM odoo_sync_log ORDER BY id DESC LIMIT 1`).catch(() => []);
      const lastOk = await q(`SELECT finished_at FROM odoo_sync_log WHERE ok ORDER BY id DESC LIMIT 1`).catch(() => []);
      res.json({ configured: isConfigured(), running, last: last[0] || null, last_ok_at: lastOk[0]?.finished_at || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Ручний запуск: { from, to, overwrite }. Без періоду — поточний місяць.
  app.post('/api/odoo/sync', requireAuth, async (req, res) => {
    try {
      if (req.body?.overwrite && req.user?.role !== 'owner') return res.status(403).json({ error: 'Перезапис ручних сум — тільки для власника' });
      const p = autoPeriod();
      const from = req.body?.from || p.from, to = req.body?.to || p.to;
      const r = await syncRange(q, from, to, { overwrite: !!req.body?.overwrite, trigger: 'user:' + (req.user?.login || req.user?.full_name || req.user?.id || '?') });
      res.json({ ok: true, from, to, ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Цифри для картки ЗП — лише показ, нічого не зберігає
  app.get('/api/odoo/salary-facts', requireAuth, async (req, res) => {
    try {
      if (!req.user?.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
      res.json(await salaryFacts(q, parseInt(req.query.employee_id), req.query.year, req.query.month, effectiveDeptCode));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Підказки відповідності співробітників ↔ користувачів Odoo
  app.get('/api/odoo/matches', requireOwner, async (req, res) => {
    try { res.json(await suggestMatches(q)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/odoo/matches/auto', requireOwner, async (req, res) => {
    try { res.json(await autoLink(q)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Ручна прив'язка: { odoo_user_id } (null — відв'язати)
  app.put('/api/employees/:id/odoo-user', requireOwner, async (req, res) => {
    try {
      const v = req.body?.odoo_user_id == null || req.body.odoo_user_id === '' ? null : parseInt(req.body.odoo_user_id);
      const rows = await q(`UPDATE employees SET odoo_user_id=$1 WHERE id=$2 RETURNING id, name, odoo_user_id`, [v, req.params.id]);
      res.json(rows[0] || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Автосинхронізація раз на годину (перший запуск — через 2 хв після старту)
  if (isConfigured()) {
    const tick = async () => {
      const p = autoPeriod();
      try {
        const r = await syncRange(q, p.from, p.to, { trigger: 'auto' });
        console.log(`✅ Odoo sync ${p.from}..${p.to}:`, JSON.stringify(r));
      } catch (e) { console.error('❌ Odoo sync:', e.message); }
    };
    setTimeout(tick, 2 * 60 * 1000);
    setInterval(tick, 60 * 60 * 1000);
    console.log('🔗 Odoo sync увімкнено (щогодини)');
  } else {
    console.log('ℹ️ Odoo sync вимкнено — немає змінних ODOO_*');
  }
}

module.exports = { mount, syncRange, autoPeriod, kyivDay, kyivDayStartUtc, nameScore, pickAuto, DEPT_RULES, isConfigured };

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const { google } = require('googleapis');

const SHEET_ID = '1hpf2y3T2VR6CVWXAMOpc6m6smQDShIangZwF6tsohRM';
const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'ikorka-schedule',
  private_key_id: process.env.GOOGLE_KEY_ID,
  private_key: (process.env.GOOGLE_PRIVATE_KEY||'').replace(/\\n/g,'\n'),
  client_email: 'ikorka-schedule@ikorka-schedule.iam.gserviceaccount.com',
  client_id: '110402235356036667065',
  token_uri: 'https://oauth2.googleapis.com/token',
};

// ── Групи відділів ───────────────────────────────────────────
// Продажі — ЗП по % виконання плану
const SALES_DEPTS = ['rzpk','retail','wholesale','resellers','hot'];
// Реактивація/Відмови — ЗП по кількості замовлень
const ORDER_DEPTS = ['refuse','reactivation'];

// ── Константи виплат ─────────────────────────────────────────
const NEW_DAY_BASE      = 15000;  // базова ставка новачка (продажі і відмови) для розрахунку авансу: ставка дня = 15000/22
const SALES_ADVANCE     = 7000;   // фікс аванс продажів для «старих» (виплата 1)
const ORDER_ADVANCE     = 5000;   // фікс аванс відмов для «старих» (виплата 1)
const TRAIN_DAY_PAY     = 100;    // оплата за день навчання (статус 'навч')

// ── Гарячі продажі (hot): своя схема ──────────────────────────
const HOT_RATE_CALLS    = 350;   // ставка за зміну (дзвінки, база 10-17 = 7 год)
const HOT_RATE_INSTA    = 450;   // ставка за зміну (Інста/директ, 10-21)
const HOT_HOUR_EXTRA    = 50;    // +50 за кожну годину понад 7
const HOT_BASE_HOURS    = 7;     // базова зміна дзвінків
const HOT_PCT_OFFICE    = 0.02;  // ОФІС 1,3,4,5 — звичайні гарячі
const HOT_PCT_PASTA     = 0.02;  // Паста
const HOT_PCT_OFFICE2   = 0.05;  // ОФІС 2 — відмови + недзвін 2
const HOT_PCT_ACTION_HI = 0.025; // Акція 230, СРЧ >= 1000
const HOT_PCT_ACTION_LO = 0.02;  // Акція 230, СРЧ < 1000
const HOT_SRCH_LIMIT    = 1000;  // поріг СРЧ для підвищеного %
// години робочих статусів (для підрахунку понаднормових)
const STATUS_HOURS = {'10-18':8,'11-18':7,'10-17':7,'9:30-17:30':8,'9-17':8,'9-18':9,
  '9-19':10,'9-19:30':10.5,'8:30-16:30':8,'удаленка':8,'запізн':7,'відробіт':8};

async function getSheetsClient(){
  const auth = new google.auth.GoogleAuth({
    credentials: SERVICE_ACCOUNT,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ═══════════════════════════════════════════════════════════
// АВТОРИЗАЦІЯ ТА ПРАВА ДОСТУПУ
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');

// Отримати користувача за токеном (Authorization: Bearer <token>)
async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const rows = await q(
    `SELECT u.* FROM app_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true`, [token]);
  if (!rows.length) return null;
  const u = rows[0];
  u.depts = u.dept_codes ? u.dept_codes.split(',').map(x => x.trim()).filter(Boolean) : null;
  return u;
}

// middleware: вимагає входу
async function requireAuth(req, res, next) {
  const u = await getUser(req);
  if (!u) return res.status(401).json({ error: 'Потрібен вхід' });
  req.user = u;
  next();
}

// middleware: вимагає доступ до Фінансів
async function requireFinance(req, res, next) {
  const u = await getUser(req);
  if (!u) return res.status(401).json({ error: 'Потрібен вхід' });
  if (!u.can_finance) return res.status(403).json({ error: 'Немає доступу до фінансів' });
  req.user = u;
  next();
}

// Чи має користувач доступ до ЗП цього відділу.
// ВАЖЛИВО: графіки доступні ВСІМ авторизованим — dept_codes обмежує лише ЗП.
function canDept(user, code) {
  if (!user) return false;
  if (!user.can_salary) return false;    // немає права на ЗП взагалі
  if (!user.depts) return true;          // null = всі відділи
  return user.depts.includes(code);
}

// ── ВХІД ──
app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Вкажіть логін і пароль' });
    const rows = await q(
      `SELECT * FROM app_users WHERE lower(login)=lower($1) AND is_active=true`, [login]);
    if (!rows.length || rows[0].pass_hash !== sha256(password))
      return res.status(401).json({ error: 'Невірний логін або пароль' });
    const u = rows[0];
    const token = newToken();
    await q(`INSERT INTO app_sessions (token, user_id, expires_at)
             VALUES ($1,$2, NOW() + INTERVAL '30 days')`, [token, u.id]);
    await q(`UPDATE app_users SET last_login=NOW() WHERE id=$1`, [u.id]);
    res.json({
      token,
      user: {
        id: u.id, full_name: u.full_name, role: u.role,
        dept_codes: u.dept_codes ? u.dept_codes.split(',').map(x=>x.trim()) : null,
        can_finance: u.can_finance, can_salary: u.can_salary,
        only_employee_id: u.only_employee_id,
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ХТО Я ──
app.get('/api/me', async (req, res) => {
  const u = await getUser(req);
  if (!u) return res.status(401).json({ error: 'Потрібен вхід' });
  res.json({
    id: u.id, full_name: u.full_name, role: u.role,
    dept_codes: u.depts, can_finance: u.can_finance,
    can_salary: u.can_salary, only_employee_id: u.only_employee_id,
  });
});

// ── ВИХІД ──
app.post('/api/logout', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) await q(`DELETE FROM app_sessions WHERE token=$1`, [token]);
  res.json({ ok: true });
});

// ── ЗМІНА ВЛАСНОГО ПАРОЛЯ (будь-який користувач) ──
app.post('/api/change-password', async (req, res) => {
  try {
    const u = await getUser(req);
    if (!u) return res.status(401).json({ error: 'Потрібен вхід' });
    const { old_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 5)
      return res.status(400).json({ error: 'Новий пароль — мінімум 5 символів' });
    if (u.pass_hash !== sha256(old_password))
      return res.status(403).json({ error: 'Невірний поточний пароль' });
    await q(`UPDATE app_users SET pass_hash=$1 WHERE id=$2`, [sha256(new_password), u.id]);
    // всі інші сесії цього користувача — вийти
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    await q(`DELETE FROM app_sessions WHERE user_id=$1 AND token<>$2`, [u.id, token]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── КЕРУВАННЯ КОРИСТУВАЧАМИ (тільки owner) ──
app.get('/api/users', async (req, res) => {
  try {
    const u = await getUser(req);
    if (!u || u.role !== 'owner') return res.status(403).json({ error: 'Тільки для власника' });
    res.json(await q(`SELECT id, login, full_name, role, dept_codes, can_finance, can_salary,
                             only_employee_id, is_active, last_login FROM app_users ORDER BY id`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const u = await getUser(req);
    if (!u || u.role !== 'owner') return res.status(403).json({ error: 'Тільки для власника' });
    const { login, password, full_name, role, dept_codes, can_finance, can_salary, only_employee_id } = req.body;
    const rows = await q(
      `INSERT INTO app_users (login, pass_hash, full_name, role, dept_codes, can_finance, can_salary, only_employee_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, login, full_name, role`,
      [login, sha256(password), full_name, role || 'schedule', dept_codes || null,
       !!can_finance, !!can_salary, only_employee_id || null]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const u = await getUser(req);
    if (!u || u.role !== 'owner') return res.status(403).json({ error: 'Тільки для власника' });
    if (parseInt(req.params.id) === u.id) return res.status(400).json({ error: 'Не можна видалити себе' });
    await q(`DELETE FROM app_users WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const u = await getUser(req);
    if (!u || u.role !== 'owner') return res.status(403).json({ error: 'Тільки для власника' });
    const { password, full_name, role, dept_codes, can_finance, can_salary, only_employee_id, is_active } = req.body;
    if (password) await q(`UPDATE app_users SET pass_hash=$1 WHERE id=$2`, [sha256(password), req.params.id]);
    const rows = await q(
      `UPDATE app_users SET
         full_name=COALESCE($1,full_name), role=COALESCE($2,role),
         dept_codes=$3, can_finance=COALESCE($4,can_finance),
         can_salary=COALESCE($5,can_salary), only_employee_id=$6,
         is_active=COALESCE($7,is_active)
       WHERE id=$8 RETURNING id, login, full_name, role, dept_codes, can_finance, can_salary, is_active`,
      [full_name, role, dept_codes || null, can_finance, can_salary,
       only_employee_id || null, is_active, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (_, res) => res.json({ ok: true }));

// ── DEPARTMENTS ──────────────────────────────────────────────
app.get('/api/departments', async (_, res) => {
  try {
    res.json(await q(`SELECT * FROM departments
                      WHERE COALESCE(is_active, true) = true
                      ORDER BY id`));
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// всі відділи, включно з архівними (для звітів за минулі місяці)
app.get('/api/departments/all', async (_, res) => {
  try { res.json(await q('SELECT * FROM departments ORDER BY id')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  try {
    const { dept, include_month } = req.query;
    // fired_date — останній день зі статусом '-' (звільнення)
    let sql = `SELECT e.*, d.name AS dept_name, d.code AS dept_code,
                      (SELECT MAX(se.entry_date) FROM schedule_entries se
                       WHERE se.employee_id = e.id AND se.status = '-') AS fired_date
               FROM employees e JOIN departments d ON d.id = e.department_id
               WHERE 1=1`;
    const params = [];
    if (include_month) {
      const [iy, im] = include_month.split('-').map(Number);
      const mStart = `${iy}-${String(im).padStart(2,'0')}-01`;
      const mEnd = new Date(iy, im, 0).toISOString().slice(0,10);
      params.push(mStart, mEnd);
      sql += ` AND (e.is_active = true OR EXISTS (
        SELECT 1 FROM schedule_entries se2
        WHERE se2.employee_id = e.id AND se2.entry_date BETWEEN $${params.length-1} AND $${params.length}
            AND se2.status IS NOT NULL AND se2.status NOT IN ('', '-', 'звіл.', 'звіл')
        ))`;
    } else {
      sql += ` AND e.is_active = true`;
    }
    if (dept) { sql += ` AND d.code = $${params.length+1}`; params.push(dept); }
    sql += ' ORDER BY d.id, COALESCE(e.sort_order, 999999), e.name';
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET archived employees
app.get('/api/employees/archived', async (req, res) => {
  try {
    const { dept } = req.query;
    let sql = `SELECT e.*, d.name AS dept_name, d.code AS dept_code
               FROM employees e JOIN departments d ON d.id = e.department_id
               WHERE e.is_active = false`;
    const params = [];
    if (dept) { sql += ` AND d.code = $1`; params.push(dept); }
    sql += ' ORDER BY d.id, e.name';
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', async (req, res) => {
  try {
    const { name, department_id, level, role, team, start_date } = req.body;
    const rows = await q(
      `INSERT INTO employees (name, department_id, level, role, team, start_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, department_id, level || 'mid', role || 'manager', team || null, start_date || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/employees/:id', async (req, res) => {
  try {
    const { name, department_id, level, role, is_active, team, start_date, position } = req.body;
    const rows = await q(
      `UPDATE employees SET
        name = COALESCE($1, name),
        department_id = COALESCE($2, department_id),
        level = COALESCE($3, level),
        role = COALESCE($4, role),
        is_active = COALESCE($5, is_active),
        team = COALESCE($7, team),
        start_date = COALESCE($8, start_date),
        position = COALESCE($9, position)
       WHERE id = $6 RETURNING *`,
      [name, department_id, level, role, is_active, req.params.id, team || null, start_date || null, position || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── ПОРЯДОК СПІВРОБІТНИКІВ (drag & drop) ──
app.put('/api/employees/reorder', requireAuth, async (req, res) => {
  try {
    const { order } = req.body;   // [{id, sort_order}, ...]
    if (!Array.isArray(order) || !order.length) return res.json({ ok: true, count: 0 });
    for (const it of order) {
      await q(`UPDATE employees SET sort_order=$1 WHERE id=$2`,
              [parseInt(it.sort_order) || 0, parseInt(it.id)]);
    }
    res.json({ ok: true, count: order.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── SCHEDULE ─────────────────────────────────────────────────
app.get('/api/schedule', async (req, res) => {
  try {
    const { year, month, dept } = req.query;
    const y = parseInt(year  || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);
    let sql = `SELECT se.*, e.name AS emp_name, e.level, e.role,
                      d.code AS dept_code, d.name AS dept_name
               FROM schedule_entries se
               JOIN employees e ON e.id = se.employee_id
               JOIN departments d ON d.id = e.department_id
               WHERE se.entry_date BETWEEN $1 AND $2`;
    const params = [start, end];
    if (dept) { sql += ` AND d.code = $3`; params.push(dept); }
    sql += ' ORDER BY d.id, e.name, se.entry_date';
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/schedule', async (req, res) => {
  try {
    const { employee_id, entry_date, status, note, updated_by } = req.body;
    const rows = await q(
      `INSERT INTO schedule_entries (employee_id, entry_date, status, note, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (employee_id, entry_date)
       DO UPDATE SET status=$3, note=$4, updated_by=$5, updated_at=NOW() RETURNING *`,
      [employee_id, entry_date, status, note||null, updated_by||null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BULK — масове заповнення графіка (одним запитом)
app.put('/api/schedule/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) return res.json({ ok: true, count: 0 });

    const vals = [], params = [];
    entries.forEach((e, i) => {
      const o = i * 4;
      vals.push(`($${o+1},$${o+2},$${o+3},$${o+4},NOW())`);
      params.push(e.employee_id, e.entry_date, e.status, e.note || null);
    });

    await q(
      `INSERT INTO schedule_entries (employee_id, entry_date, status, note, updated_at)
       VALUES ${vals.join(',')}
       ON CONFLICT (employee_id, entry_date)
       DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, updated_at=NOW()`,
      params
    );
    res.json({ ok: true, count: entries.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REVENUE DETAIL (по менеджеру) ────────────────────────────
app.get('/api/revenue/detail', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);
    res.json(await q(
      `SELECT rd.*, e.name AS emp_name, e.level, d.code AS dept_code
       FROM daily_revenue_detail rd
       JOIN employees e ON e.id = rd.employee_id
       JOIN departments d ON d.id = e.department_id
       WHERE rd.revenue_date BETWEEN $1 AND $2
       ORDER BY rd.revenue_date, e.name`,
      [start, end]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/revenue/detail', async (req, res) => {
  try {
    const { employee_id, revenue_date, amount, note } = req.body;
    const rows = await q(
      `INSERT INTO daily_revenue_detail (employee_id, revenue_date, amount, note, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (employee_id, revenue_date)
       DO UPDATE SET amount=$3, note=$4, updated_at=NOW() RETURNING *`,
      [employee_id, revenue_date, amount, note||null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REVENUE DEPT (по відділу одною цифрою) ───────────────────
app.get('/api/revenue/dept', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);
    res.json(await q(
      `SELECT rd.*, d.code AS dept_code, d.name AS dept_name
       FROM daily_revenue_dept rd JOIN departments d ON d.id = rd.department_id
       WHERE rd.revenue_date BETWEEN $1 AND $2 ORDER BY rd.revenue_date`,
      [start, end]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/revenue/dept', async (req, res) => {
  try {
    const { department_id, revenue_date, amount, note } = req.body;
    const rows = await q(
      `INSERT INTO daily_revenue_dept (department_id, revenue_date, amount, note, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (department_id, revenue_date)
       DO UPDATE SET amount=$3, note=$4, updated_at=NOW() RETURNING *`,
      [department_id, revenue_date, amount, note||null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LEVEL PLANS ──────────────────────────────────────────────
app.get('/api/plans', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    res.json(await q(
      `SELECT lp.*, d.code AS dept_code, d.name AS dept_name
       FROM level_plans lp JOIN departments d ON d.id = lp.department_id
       WHERE lp.plan_year=$1 AND lp.plan_month=$2 ORDER BY d.id, lp.level`,
      [y, m]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/plans', async (req, res) => {
  try {
    const { department_id, plan_year, plan_month, level, plan_amount } = req.body;
    const rows = await q(
      `INSERT INTO level_plans (department_id, plan_year, plan_month, level, plan_amount, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (department_id, plan_year, plan_month, level)
       DO UPDATE SET plan_amount=$5, updated_at=NOW() RETURNING *`,
      [department_id, plan_year, plan_month, level, plan_amount]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STATS: план відділу = сума планів активних менеджерів ────
app.get('/api/stats', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);

    // Кількість активних менеджерів по рівнях і відділах
    // РОП, тімлід і керівник не рахуються в план
    const empCounts = await q(`
      SELECT d.id AS dept_id, d.code AS dept_code, e.level, COUNT(*) AS cnt
      FROM employees e JOIN departments d ON d.id = e.department_id
      WHERE e.is_active = true
        AND e.role NOT IN ('rop','head','teamlead')
        AND e.level != 'new'
      GROUP BY d.id, d.code, e.level
    `);

    const plans = await q(`
      SELECT * FROM level_plans
      WHERE plan_year=$1 AND plan_month=$2`, [y, m]);

    const revDetail = await q(`
      SELECT e.department_id, SUM(rd.amount) AS total
      FROM daily_revenue_detail rd JOIN employees e ON e.id = rd.employee_id
      WHERE rd.revenue_date BETWEEN $1 AND $2
      GROUP BY e.department_id`, [start, end]);

    const revDept = await q(`
      SELECT department_id, SUM(amount) AS total
      FROM daily_revenue_dept
      WHERE revenue_date BETWEEN $1 AND $2
      GROUP BY department_id`, [start, end]);

    const statusStats = await q(`
      SELECT d.code AS dept_code, se.status, COUNT(*) AS cnt
      FROM schedule_entries se
      JOIN employees e ON e.id = se.employee_id
      JOIN departments d ON d.id = e.department_id
      WHERE se.entry_date BETWEEN $1 AND $2 AND e.is_active = true
      GROUP BY d.code, se.status`, [start, end]);

    const depts = await q('SELECT * FROM departments ORDER BY id');
    const result = depts.map(dept => {
      let planTotal = 0;
      const planBreakdown = {};
      ['top','mid','jun'].forEach(lvl => {
        const empRow  = empCounts.find(r => r.dept_id === dept.id && r.level === lvl);
        const planRow = plans.find(r => r.department_id === dept.id && r.level === lvl);
        const cnt  = parseInt(empRow?.cnt  || 0);
        const pamt = parseFloat(planRow?.plan_amount || 0);
        planBreakdown[lvl] = { cnt, plan_per_person: pamt, subtotal: cnt * pamt };
        planTotal += cnt * pamt;
      });

      const detailRow = revDetail.find(r => r.department_id === dept.id);
      const deptRow   = revDept.find(r => r.department_id === dept.id);
      const factTotal = Math.max(
        parseFloat(detailRow?.total || 0),
        parseFloat(deptRow?.total   || 0)
      );

      const pct = planTotal > 0 ? Math.round(factTotal / planTotal * 100) : 0;

      const statuses = {};
      statusStats.filter(s => s.dept_code === dept.code)
        .forEach(s => { statuses[s.status] = parseInt(s.cnt); });

      return {
        dept_id:   dept.id,
        dept_code: dept.code,
        dept_name: dept.name,
        plan_total: planTotal,
        plan_breakdown: planBreakdown,
        fact_total: factTotal,
        pct,
        statuses,
      };
    });

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SALARY ───────────────────────────────────────────
app.get('/api/salary', async (req, res) => {
  try {
    const { year, month, dept } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    let sql = `SELECT s.*, e.name AS emp_name, d.code AS dept_code
               FROM salary_calc s
               JOIN employees e ON e.id = s.employee_id
               JOIN departments d ON d.id = e.department_id
               WHERE s.calc_year=$1 AND s.calc_month=$2`;
    const params = [y, m];
    if (dept) { sql += ' AND d.code=$3'; params.push(dept); }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/salary', requireAuth, async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct, worked_days, senior_bonus, penalty, note, bonus_manual } = req.body;
    // перевірка прав: ЗП можна вводити лише своїм відділам
    if (!req.user.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
    const empRow = await q(`SELECT d.code FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.id=$1`, [employee_id]);
    if (empRow.length && !canDept(req.user, empRow[0].code))
      return res.status(403).json({ error: 'Немає доступу до цього відділу' });
    if (req.user.only_employee_id && req.user.only_employee_id !== parseInt(employee_id))
      return res.status(403).json({ error: 'Немає доступу до цього співробітника' });
    const rows = await q(
      `INSERT INTO salary_calc (employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct, worked_days, senior_bonus, penalty, note, bonus_manual, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET plan_amount=$4, fact_amount=$5, returns_pct=$6, worked_days=$7, senior_bonus=$8, penalty=$9, note=$10, bonus_manual=$11, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct||0, worked_days||0, senior_bonus||0, penalty||0, note||null, bonus_manual||0]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GOOGLE SHEETS EXPORT ─────────────────────────────
app.post('/api/export/salary', async (req, res) => {
  try {
    const { year, month, dept, sheet_name } = req.body;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);

    let sql = `
      SELECT e.id AS employee_id, e.name, e.level, e.role, d.code AS dept_code, d.name AS dept_name,
             sc.plan_amount, sc.fact_amount, sc.returns_pct, sc.worked_days,
             sc.senior_bonus, sc.penalty, sc.note,
             sc.updated_at
      FROM salary_calc sc
      JOIN employees e ON e.id = sc.employee_id
      JOIN departments d ON d.id = e.department_id
      WHERE sc.calc_year=$1 AND sc.calc_month=$2 AND e.is_active=true`;
    const params = [y, m];
    if(dept){ sql += ' AND d.code=$3'; params.push(dept); }
    sql += ' ORDER BY d.id, e.name';

    const salaries = await q(sql, params);

    // корегування ЗП за місяць (для інформаційної колонки — у формулу РАЗОМ нижче
    // свідомо НЕ додаємо, щоб не змінити вже перевірений підсумок продажного розрахунку)
    const adjRows = await q(
      `SELECT * FROM salary_adjustments WHERE calc_year=$1 AND calc_month=$2 ORDER BY created_at`, [y, m]);
    const adjByEmpId = {};
    adjRows.forEach(a => { (adjByEmpId[a.employee_id] = adjByEmpId[a.employee_id] || []).push(a); });

    // рядки для решти відділів (усі схеми, крім percent_plan/orders_count —
    // ті вже покриті вкладкою продажів вище) — та сама логіка, що й на сторінці
    // «Фінанси» (computeFinanceRows), тож суми завжди збігаються.
    // РОП сюди теж потрапляє — раніше він взагалі не траплявся в експорт ЗП
    // (не мав рядка в salary_calc). Гарячі продажі (hot) винесені в окрему
    // вкладку нижче — у них 14 компонентів (7 на період × 2 періоди),
    // в узагальнені 4 слоти цієї вкладки вони б не влізли.
    const financeRows = await computeFinanceRows(y, m, dept);
    const otherRows = financeRows.filter(r => r.total != null
      && !['percent_plan', 'orders_count', 'hot'].includes(r.scheme_type));
    const hotRows = financeRows.filter(r => r.total != null && r.scheme_type === 'hot');

    if (!salaries.length && !otherRows.length && !hotRows.length) {
      return res.json({ ok:false, message:'Немає даних ЗП за цей місяць' });
    }

    const sheets = await getSheetsClient();
    const tabName = sheet_name || `ЗП ${m}.${y}`;

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: { requests: [{ addSheet: { properties: { title: tabName } } }] }
      });
    } catch(e) {
      // Sheet already exists - ok
    }

    const MONTHS = ['','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    const header = [
      [`ЗП ${MONTHS[m]} ${y} — продажі/відмови`,'','','','','','','','','','','','','',''],
      ['ІМЯ','Відділ','Рівень','Кол роб.днів','План','Оборот','% повернень','Ставка','Бонус %','% бонус грн','Переробка','Доплата','Штраф','Корегування','Примітка','РАЗОМ']
    ];

    const NORM_DAYS = 22;
    const LEVEL = {top:'ТОП',mid:'Мідл',jun:'Джун',new:'Новий'};
    const dataRows = salaries.map(s => {
      const isOrderDept = ORDER_DEPTS.includes(s.dept_code);
      const ret = parseFloat(s.returns_pct)||0;
      const retExcess = Math.max(0, ret-6);
      const retCorr = (s.fact_amount||0)*retExcess/100;
      const cleanBase = (s.fact_amount||0)-retCorr;
      const plan = s.plan_amount||0;
      const pct = plan>0 ? Math.round(cleanBase/plan*100) : 0;
      const days = s.worked_days||0;

      let rate=0, bonusPct=0;
      if(isOrderDept){
        const orders=plan;
        if(orders>=150){rate=11000;bonusPct=9;}
        else if(orders>=115){rate=10000;bonusPct=8;}
        else if(orders>=90){rate=9000;bonusPct=7;}
        else{rate=0;bonusPct=5;}
        const fullRate=days>=22&&orders>=90;
        rate=fullRate?rate:Math.round(rate*days/NORM_DAYS);
      } else {
        if(days<15&&pct<80){rate=8000;bonusPct=4;}
        else if(pct<70){rate=13000;bonusPct=4;}
        else if(pct<80){rate=13000;bonusPct=4.5;}
        else if(pct<100){rate=15000;bonusPct=5;}
        else if(pct<110){rate=15000;bonusPct=6;}
        else{rate=15000;bonusPct=7;}
      }
      const bonus = Math.round(cleanBase*bonusPct/100);
      const overtime = Math.max(0,days-NORM_DAYS)*(isOrderDept?450:400);
      const senior = parseFloat(s.senior_bonus)||0;
      const penalty = parseFloat(s.penalty)||0;
      const total = rate+bonus+overtime+senior-penalty;   // формула НЕ змінена
      const adjList = adjByEmpId[s.employee_id] || [];
      const adjTotal = adjList.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

      return [
        s.name,
        s.dept_name,
        LEVEL[s.level]||s.level,
        days,
        plan,
        s.fact_amount||0,
        ret+'%',
        rate,
        bonusPct+'%',
        bonus,
        overtime||'',
        senior||'',
        penalty||'',
        adjTotal||'',
        s.note||'',
        total
      ];
    });

    const values = [...header, ...dataRows];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });

    // ── друга вкладка: решта відділів (ставочники, наставник, рекрутер,
    //    склад, гарячі продажі, РОП…) — з деталізацією по компонентах ──
    let otherTab = null, otherCount = 0;
    if (otherRows.length) {
      otherTab = `${tabName} (інші)`;
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          resource: { requests: [{ addSheet: { properties: { title: otherTab } } }] }
        });
      } catch (e) { /* вкладка вже є — ок */ }

      const SCHEME_LABEL = {
        fixed_rate: 'Ставочник', mentor: 'Наставник', recruiter: 'Рекрутер',
        hourly: 'Вантажник (год.)', hourly_fixed: 'Вантажник (фікс+год.)',
        piece_warehouse: 'Склад-відрядник', warehouse_hybrid: 'Начальник складу',
        hot: 'Гарячі продажі', rop: 'РОП',
      };
      const otherHeader = [
        [`ЗП ${MONTHS[m]} ${y} — інші відділи`,'','','','','','','','','','','','','',''],
        ['ІМЯ','Відділ','Рівень','Схема',
         'Компонент 1','Сума 1','Компонент 2','Сума 2','Компонент 3','Сума 3','Компонент 4','Сума 4',
         'Корегування','Виплата1','Виплата2','РАЗОМ'],
      ];
      const otherDataRows = otherRows.map(r => {
        const items = r.breakdown_components || [];
        const slots = [0, 1, 2, 3].map(i => items[i] || null);
        return [
          r.name, r.dept_name, LEVEL[r.level] || r.level, SCHEME_LABEL[r.scheme_type] || r.scheme_type,
          ...slots.flatMap(it => [it ? it.label : '', it ? it.amount : '']),
          r.adj_total || '',
          r.payout1 != null ? r.payout1 : (r.advance != null ? r.advance : ''),
          r.payout2 != null ? r.payout2 : (r.remainder != null ? r.remainder : ''),
          r.total,
        ];
      });
      const otherValues = [...otherHeader, ...otherDataRows];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${otherTab}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: otherValues },
      });
      otherCount = otherRows.length;
    }

    // ── третя вкладка: гарячі продажі окремо — фіксовані 14 колонок компонентів
    //    (7 на період 1-14 + 7 на період 15-кінець), бо в 4 узагальнені слоти
    //    вкладки «(інші)» ця схема не влізає. Кожна колонка — завжди той самий
    //    компонент на тому самому місці (нулі не приховуються, щоб не зсунути
    //    сусідні колонки).
    let hotTab = null, hotCount = 0;
    if (hotRows.length) {
      hotTab = `${tabName} (гарячі)`;
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          resource: { requests: [{ addSheet: { properties: { title: hotTab } } }] }
        });
      } catch (e) { /* вкладка вже є — ок */ }

      const hotHeader = [
        [`ЗП ${MONTHS[m]} ${y} — гарячі продажі`,'','','','','','','','','','','','','','','','','','','',''],
        ['ІМЯ','Відділ','Рівень',
         'П1: Ставка','П1: ОФІС1345 %','П1: Паста %','П1: ОФІС2 %','П1: Акція230 %','П1: Доплата','П1: Штраф',
         'П2: Ставка','П2: ОФІС1345 %','П2: Паста %','П2: ОФІС2 %','П2: Акція230 %','П2: Доплата','П2: Штраф',
         'Корегування','Виплата1','Виплата2','РАЗОМ'],
      ];
      const hotDataRows = hotRows.map(r => {
        const p1 = r.period1 || {}, p2 = r.period2 || {};
        return [
          r.name, r.dept_name, LEVEL[r.level] || r.level,
          p1.rate || 0, p1.pay_office || 0, p1.pay_pasta || 0, p1.pay_office2 || 0, p1.pay_action || 0, p1.bonus || 0, p1.penalty || 0,
          p2.rate || 0, p2.pay_office || 0, p2.pay_pasta || 0, p2.pay_office2 || 0, p2.pay_action || 0, p2.bonus || 0, p2.penalty || 0,
          r.adj_total || '',
          r.payout1 != null ? r.payout1 : '',
          r.payout2 != null ? r.payout2 : '',
          r.total,
        ];
      });
      const hotValues = [...hotHeader, ...hotDataRows];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${hotTab}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: hotValues },
      });
      hotCount = hotRows.length;
    }

    res.json({
      ok: true,
      message: `Експортовано ${salaries.length} рядків у "${tabName}"`
        + (otherCount ? ` та ${otherCount} рядків у "${otherTab}"` : '')
        + (hotCount ? ` та ${hotCount} рядків у "${hotTab}"` : ''),
      tab: tabName, other_tab: otherTab, hot_tab: hotTab,
    });
  } catch(e) {
    console.error('Sheets export error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SALARY SCHEMES (оклади ставочників)
// ═══════════════════════════════════════════════════════════
app.get('/api/salary-schemes', async (_, res) => {
  try {
    res.json(await q(`SELECT s.*, e.name AS emp_name, d.code AS dept_code
                      FROM salary_schemes s
                      JOIN employees e ON e.id = s.employee_id
                      JOIN departments d ON d.id = e.department_id`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/salary-schemes', requireAuth, async (req, res) => {
  try {
    const { employee_id, scheme_type, base_rate, norm_days, norm_type, fixed_amount } = req.body;
    const rows = await q(
      `INSERT INTO salary_schemes (employee_id, scheme_type, base_rate, norm_days, norm_type, fixed_amount, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (employee_id)
       DO UPDATE SET scheme_type=$2, base_rate=$3, norm_days=$4, norm_type=$5, fixed_amount=$6, updated_at=NOW()
       RETURNING *`,
      [employee_id, scheme_type || 'fixed_rate', base_rate || 0, norm_days || 22, norm_type || 'fixed', fixed_amount || 0]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// SALARY ADJUSTMENTS (корегування ЗП: премії, доплати, штрафи…)
// ═══════════════════════════════════════════════════════════
app.get('/api/salary-adjustments', async (req, res) => {
  try {
    const { employee_id, year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM salary_adjustments WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(employee_id)); }
    sql += ` ORDER BY created_at`;
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/salary-adjustments', async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, type, amount, comment } = req.body;
    const rows = await q(
      `INSERT INTO salary_adjustments (employee_id, calc_year, calc_month, type, amount, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, calc_year, calc_month, type || 'інше', amount || 0, comment || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/salary-adjustments/:id', async (req, res) => {
  try {
    await q(`DELETE FROM salary_adjustments WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ═══════════════════════════════════════════════════════════
// АВАНСИ, ВИДАНІ ЗАЗДАЛЕГІДЬ (наприклад готівкою серед місяця) —
// автоматично зменшують Виплату 1 (а якщо не вистачає — і Виплату 2),
// не змінюючи саму ставку/total.
// ═══════════════════════════════════════════════════════════
app.get('/api/advance-payments', async (req, res) => {
  try {
    const { employee_id, year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM advance_payments WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(employee_id)); }
    sql += ` ORDER BY created_at`;
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/advance-payments', requireFinance, async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, amount, payment_date, comment } = req.body;
    const rows = await q(
      `INSERT INTO advance_payments (employee_id, calc_year, calc_month, amount, payment_date, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, calc_year, calc_month, amount || 0, payment_date || null, comment || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/advance-payments/:id', requireFinance, async (req, res) => {
  try {
    await q(`DELETE FROM advance_payments WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ═══════════════════════════════════════════════════════════
// СКЛАД — відрядники (упаковка + фасовка + вихід)
// Тарифи упаковки: 6/7/8/9 грн; фасовка: скло 1 грн, пластик 1.5 грн
// День = pack6*6+pack7*7+pack8*8+pack9*9 + glass*1+plastic*1.5 + exit_rate
// ═══════════════════════════════════════════════════════════
function warehouseDayAmount(r) {
  const p = (r.pack6||0)*6 + (r.pack7||0)*7 + (r.pack8||0)*8 + (r.pack9||0)*9;
  const f = (r.glass||0)*1 + (r.plastic||0)*1.5;
  const exit = r.exit_rate == null ? 300 : (parseInt(r.exit_rate) || 0);
  return { pack: p, fasovka: f, exit, total: p + f + exit };
}

// Дата у форматі YYYY-MM-DD (Date -> ISO, рядок -> як є).
// ВАЖЛИВО: String(Date) дає "Tue Jul 14 2026..." — фронт такий формат не розуміє.
function ymd(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 && s[4] === '-' ? s.slice(0, 10) : new Date(s).toISOString().slice(0, 10);
}

// Тільки фасовка (скло×1 + пластик×1.5), БЕЗ упаковки і виходу.
// Для гібридної схеми начальника складу (warehouse_hybrid).
function fasovkaDayAmount(r) {
  return (r.glass||0)*1 + (r.plastic||0)*1.5;
}

app.get('/api/warehouse/daily', async (req, res) => {
  try {
    const { year, month, employee_id } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);
    let sql = `SELECT * FROM warehouse_daily WHERE work_date BETWEEN $1 AND $2`;
    const params = [start, end];
    if (employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(employee_id)); }
    sql += ` ORDER BY work_date`;
    const rows = await q(sql, params);
    res.json(rows.map(r => ({ ...r, work_date: ymd(r.work_date), calc: warehouseDayAmount(r) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/warehouse/daily', async (req, res) => {
  try {
    const { employee_id, work_date, pack6, pack7, pack8, pack9, glass, plastic, exit_rate } = req.body;
    const rows = await q(
      `INSERT INTO warehouse_daily (employee_id, work_date, pack6, pack7, pack8, pack9, glass, plastic, exit_rate, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET pack6=$3, pack7=$4, pack8=$5, pack9=$6, glass=$7, plastic=$8, exit_rate=$9, updated_at=NOW()
       RETURNING *`,
      [employee_id, work_date, pack6||0, pack7||0, pack8||0, pack9||0, glass||0, plastic||0, exit_rate==null?300:exit_rate]
    );
    const r = rows[0];
    res.json({ ...r, work_date: ymd(r.work_date), calc: warehouseDayAmount(r) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// сума за місяць по відряднику
async function warehouseMonthTotal(employeeId, y, m) {
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const end   = new Date(y, m, 0).toISOString().slice(0,10);
  const rows = await q(
    `SELECT * FROM warehouse_daily WHERE employee_id=$1 AND work_date BETWEEN $2 AND $3`,
    [employeeId, start, end]);
  let total = 0, days = 0;
  rows.forEach(r => { total += warehouseDayAmount(r).total; days += 1; });
  return { total, days };
}

// ═══════════════════════════════════════════════════════════
// СКЛАД — вантажники (почасова, ставка у base_rate, за замовч. 150/год)
// ═══════════════════════════════════════════════════════════
app.get('/api/hourly/daily', async (req, res) => {
  try {
    const { year, month, employee_id } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);
    let sql = `SELECT * FROM hourly_daily WHERE work_date BETWEEN $1 AND $2`;
    const params = [start, end];
    if (employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(employee_id)); }
    sql += ` ORDER BY work_date`;
    const rows = await q(sql, params);
    res.json(rows.map(r => ({ ...r, work_date: ymd(r.work_date) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/hourly/daily', async (req, res) => {
  try {
    const { employee_id, work_date, hours } = req.body;
    const rows = await q(
      `INSERT INTO hourly_daily (employee_id, work_date, hours, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET hours=$3, updated_at=NOW() RETURNING *`,
      [employee_id, work_date, hours || 0]
    );
    const r = rows[0];
    res.json({ ...r, work_date: ymd(r.work_date) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// РУШІЙ РОЗРАХУНКУ ЗП (ставочник fixed_rate)
// Ціна дня ЗАВЖДИ = оклад / 22.
// Еталон ("скільки днів мало бути") залежить від norm_type:
//   'fixed'          → завжди 22 (логісти). >22 доплата, <22 вирахування.
//   'month_workdays' → будні цього місяця (адмінка, бухгалтерія).
//                      відпрацював усі будні місяця = повна ставка,
//                      навіть якщо їх 20 (лютий) чи 23.
// Відпрацьована зміна = робочий статус (10-18, 8:30-16:30, удаленка, запізн, відробіт…).
// вих / больн / відпуск / навч — НЕ зміни.
// ═══════════════════════════════════════════════════════════
const WORK_STATUSES = ['10-18','11-18','10-17','9:30-17:30','9-17','9-18','9-19','9-19:30','8:30-16:30','удаленка','запізн','відробіт'];
function isWorkStatus(status) {
  if (WORK_STATUSES.includes(status)) return true;
  return /^\d{1,2}(:\d{2})?-\d{1,2}(:\d{2})?$/.test(status || '');   // довільний час "9-17", "10:15-18:30" тощо
}

// Дефолтний статус за кодом відділу і днем тижня (дзеркало фронтенду)
function defaultStatusFor(deptCode, dow, empName) {
  if (['refuse','reactivation'].includes(deptCode)) return '9:30-17:30';
  if (empName === 'Климюк Марія') {
    if (dow === 0 || dow === 6) return 'вих';        // нд, сб
    if (dow === 4 || dow === 5) return 'удаленка';   // чт, пт
    return '10-18';                                   // пн, вт, ср
  }
  if (deptCode === 'admin' && empName === 'Мединська Ірина')
    return (dow === 0 || dow === 6) ? 'вих' : '9:30-17:30';
  if (deptCode === 'accounting') return (dow === 0 || dow === 6) ? 'вих' : '9-17';
  if (deptCode === 'warehouse') return '9-19';
  if (deptCode === 'logistics') return dow === 0 ? 'вих' : '8:30-16:30';
  if (['management','training','admin','marketing','it'].includes(deptCode) && (dow === 0 || dow === 6)) return 'вих';
  return '10-18';
}

// Побудувати повний місяць статусів: збережені + дефолти для порожніх
function buildMonthEntries(y, m, savedEntries, deptCode, empName, startDate) {
  const saved = {};
  (savedEntries || []).forEach(e => { saved[String(e.entry_date).slice(0,10)] = e.status; });
  const n = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= n; d++) {
    const date = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    let status;
   const startYmd = startDate ? (startDate.toISOString ? startDate.toISOString().slice(0,10) : String(startDate).slice(0,10)) : null;
    if (date in saved) status = saved[date];
    else if (startYmd && date < startYmd) status = '';       // до старту порожньо
    else status = defaultStatusFor(deptCode, dow, empName);
    out.push({ entry_date: date, status });
  }
  return out;
}

// Порахувати відпрацьовані робочі зміни + дні навчання з набору статусів
function countWorkAndTrain(entries) {
  let worked = 0, train = 0;
  (entries || []).forEach(e => {
    if (isWorkStatus(e.status)) worked += 1;
    else if (e.status === 'навч') train += 1;
  });
  return { worked, train };
}

// Чи це ПЕРШИЙ місяць співробітника (не було реальних робочих днів у попередніх місяцях).
// Реальний день = будь-який збережений статус, КРІМ '-' (звільнення) і порожнього.
// Використовується для авансу продажів/відмов: новачок → обучення×100 + дні×8000/22, старий → фікс аванс.
async function isFirstWorkingMonth(employeeId, y, m) {
  const firstOfMonth = `${y}-${String(m).padStart(2,'0')}-01`;
  const rows = await q(
    `SELECT 1 FROM schedule_entries
     WHERE employee_id=$1 AND entry_date < $2
       AND status IS NOT NULL AND status <> '' AND status <> '-'
     LIMIT 1`,
    [employeeId, firstOfMonth]
  );
  return rows.length === 0;
}

// Новачок за ДАТОЮ ПРИЙОМУ: start_date потрапляє в поточний місяць (y,m).
// Прийнятий у цьому місяці -> новачок (аванс по днях+навчання).
// Прийнятий раніше або дата не задана -> старий (фікс аванс 7000/5000).
function isFirstMonthByStartDate(startDate, y, m) {
  if (!startDate) return false;
  const s = String(startDate).slice(0, 10);
  const sy = parseInt(s.slice(0, 4));
  const sm = parseInt(s.slice(5, 7));
  return sy === y && sm === m;
}

// кількість будніх днів (пн-пт) у місяці
function monthWeekdays(year, month) {
  const n = new Date(year, month, 0).getDate();
  let c = 0;
  for (let d = 1; d <= n; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) c++;
  }
  return c;
}

// ═══════════════════════════════════════════════════════════
// РОЗРАХУНОК ЗП: продажі (percent_plan) та відмови (orders_count)
// Дзеркало фронтового calcSalary. salRow — рядок salary_calc.
//
// Розбивка на 2 виплати:
//  Виплата 1 (аванс, 1-5 числа):
//    • НОВАЧОК (перший місяць, продажі І відмови однаково):
//         аванс = дні_навчання×100 + відпрацьовані_дні × (8000/22)
//    • СТАРИЙ:
//         продажі → 7000 фікс
//         відмови → 5000 фікс
//  Виплата 2 (15-20 числа) = max(0, total − аванс)
//    total = ставка + бонус% + переробка + навчання×100 + доплата − штраф
//    (навчання×100 входить у total як і раніше — не чіпаємо)
//
// opts = { workedFromGraph, trainDays, isFirstMonth } — з графіка місяця.
// Якщо opts не передані (старий виклик) — аванс рахується без графіка:
//   продажі → 7000, відмови → 5000, навчання = 0, новачок = false.
// ═══════════════════════════════════════════════════════════
function computeSalesSalary(salRow, isOrder, opts) {
  const o = opts || {};
  const trainDays   = parseInt(o.trainDays) || 0;
  const trainPay    = trainDays * TRAIN_DAY_PAY;
  const workedGraph = o.workedFromGraph != null ? parseInt(o.workedFromGraph) : 0;
  const isFirst     = !!o.isFirstMonth;

  // Аванс новачка (однаковий для продажів і відмов):
  //   дні_навчання×100 + відпрацьовані_дні × (8000/22)
  const newAdvance = () => Math.round(trainDays * TRAIN_DAY_PAY + workedGraph * NEW_DAY_BASE / 22);

  const fact = salRow ? (parseFloat(salRow.fact_amount) || 0) : 0;
  const plan = salRow ? (parseFloat(salRow.plan_amount) || 0) : 0;
  const ret  = salRow ? (parseFloat(salRow.returns_pct) || 0) : 0;
  const days = salRow ? (parseInt(salRow.worked_days) || 0) : 0;
  const seniorBonus = salRow ? (parseFloat(salRow.senior_bonus) || 0) : 0;
  const penalty = salRow ? (parseFloat(salRow.penalty) || 0) : 0;

  // ── СТАДІЯ АВАНСУ (оборот ще не введено) ──
  // 31 числа факт/план невідомі (повернення докапують). Показуємо ЛИШЕ виплату 1 (аванс).
  // Виплата 2 і total поки невизначені (null) — з'являться коли введуть оборот.
  if (!fact) {
    const advance = isFirst ? newAdvance() : (isOrder ? ORDER_ADVANCE : SALES_ADVANCE);
    return {
      scheme_type: isOrder ? 'orders_count' : 'percent_plan',
      advance_stage: true,
      rate: 0, bonus_pct: 0, bonus: 0, pct: 0, orders: plan,
      clean_base: 0, returns_pct: ret, worked_days: days, overtime: 0,
      train_days: trainDays, train_pay: trainPay,
      worked_graph: workedGraph, is_first_month: isFirst,
      senior_bonus: seniorBonus, penalty, fact: 0, plan,
      total: null,                 // повна ЗП ще невідома
      payout1: advance,            // виплата 1 = аванс (є вже 31 числа)
      payout2: null,               // виплата 2 з'явиться з оборотом
      pay_schedule: 'sales',       // 1-ше аванс / 15-те залишок
      advance, remainder: null,
    };
  }

  const retExcess = Math.max(0, ret - 6);
  const retCorrection = fact * retExcess / 100;
  const cleanBase = fact - retCorrection;

  let rate = 0, bonusPct = 0, total = 0, pct = 0, overtimePay = 0;

  if (isOrder) {
    const orders = plan;                 // для відмов plan = к-сть замовлень
    if (orders >= 150) { rate = 11000; bonusPct = 9; }
    else if (orders >= 115) { rate = 10000; bonusPct = 8; }
    else if (orders >= 90) { rate = 9000; bonusPct = 7; }
    else { rate = 0; bonusPct = 5; }
    const fullRate = days >= 22 && orders >= 90;
    rate = fullRate ? rate : Math.round(rate * days / 22);
    const bonus = cleanBase * bonusPct / 100;
    overtimePay = Math.max(0, days - 22) * 450;
    total = rate + bonus + overtimePay + trainPay + seniorBonus - penalty;

    // Виплата 1 (аванс):
    //   новачок → навчання×100 + дні×8000/22
    //   старий  → 5000 фікс
    let payout1 = isFirst ? newAdvance() : ORDER_ADVANCE;
    if (payout1 > total) payout1 = Math.max(0, total);   // аванс не більший за підсумок
    const payout2 = Math.max(0, total - payout1);        // виплата 2 не від'ємна

    return { scheme_type:'orders_count', rate, bonus_pct:bonusPct, bonus, orders, clean_base:cleanBase,
             returns_pct:ret, worked_days:days, overtime:overtimePay,
             train_days:trainDays, train_pay:trainPay,
             worked_graph:workedGraph, is_first_month:isFirst,
             senior_bonus:seniorBonus, penalty, fact, plan,
             total, payout1, payout2,
             pay_schedule:'sales',
             advance:payout1, remainder:payout2 };
  } else {
    pct = plan > 0 ? Math.round(cleanBase / plan * 100) : 0;
    if (days < 15 && pct < 80) { rate = 8000; bonusPct = 4; }
    else if (pct < 70) { rate = 13000; bonusPct = 4; }
    else if (pct < 80) { rate = 13000; bonusPct = 4.5; }
    else if (pct < 100) { rate = 15000; bonusPct = 5; }
    else if (pct < 110) { rate = 15000; bonusPct = 6; }
    else { rate = 15000; bonusPct = 7; }
    const bonus = cleanBase * bonusPct / 100;
    overtimePay = Math.max(0, days - 22) * 400;
    total = rate + bonus + overtimePay + trainPay + seniorBonus - penalty;

    // Виплата 1 (аванс):
    //   новачок (перший місяць) → навчання×100 + дні×8000/22
    //   старий → 7000 фікс
    let payout1 = isFirst ? newAdvance() : SALES_ADVANCE;
    if (payout1 > total) payout1 = Math.max(0, total);   // аванс не більший за підсумок
    const payout2 = Math.max(0, total - payout1);        // виплата 2 не від'ємна

    return { scheme_type:'percent_plan', rate, bonus_pct:bonusPct, bonus, pct, clean_base:cleanBase,
             returns_pct:ret, worked_days:days, overtime:overtimePay,
             train_days:trainDays, train_pay:trainPay,
             worked_graph:workedGraph, is_first_month:isFirst,
             senior_bonus:seniorBonus, penalty, fact, plan,
             total, payout1, payout2,
             pay_schedule:'sales',
             advance:payout1, remainder:payout2 };
  }
}

// ═══════════════════════════════════════════════════════════
// РОП — мотивація керівників відділів
// Ставка + KPI (СРЧ, Апрув) + план + % з особистих замовлень
// ═══════════════════════════════════════════════════════════
const ROP_CFG = {
  rzpk:   { rate: 15000, kpi: 5000, plan_bonus: 10000, own_pct: 0.05, mode: 'prop'  },
  refuse: { rate: 15000, kpi: 5000, plan_bonus: 5000,  own_pct: 0.07, mode: 'prop'  },
  hot:    { rate: 15000, kpi: 7500, plan_bonus: 0,     own_pct: 0,    mode: 'scale' },
};
// Шкала перевиконання для РОПа гарячої бази (% від ставки)
const ROP_HOT_SCALE = { 3:10, 4:15, 5:20, 6:28, 7:35, 8:42, 9:46, 10:50 };
function ropHotOverPct(over) {
  const o = Math.floor(over);
  if (o < 3) return 0;
  if (o <= 10) return ROP_HOT_SCALE[o] || 0;
  return Math.min(50 + (o - 10) * 5, 80);   // +5% за кожен % понад 10, стеля 80%
}

// ═══════════════════════════════════════════════════════════
// НАСТАВНИК — бонус за якість (середній бал тесту) + бонус за ІЕ групи
// ═══════════════════════════════════════════════════════════
function mentorQualityBonus(score) {
  const s = parseFloat(score) || 0;
  if (s <= 60) return 0;
  if (s <= 70) return 10000;
  if (s <= 78) return 11000;
  return 12000;   // 79-87 і вище — стеля 12000
}
function mentorIeBonus(ie) {
  const v = parseFloat(ie) || 0;
  if (v >= 1.07) return 6000;
  if (v >= 0.90) return 4000;
  return 0;
}

function computeRopSalary(deptCode, row) {
  const C = ROP_CFG[deptCode];
  if (!C) return null;
  const r = row || {};
  const planTarget = parseFloat(r.plan_target) || 0;
  const planFact   = parseFloat(r.plan_fact)   || 0;
  const srchOk = !!r.srch_ok, aprOk = !!r.apr_ok;
  const pct = planTarget > 0 ? (planFact / planTarget * 100) : 0;

  // KPI виплачуються незалежно від плану
  let payKpi = 0;
  if (srchOk) payKpi += C.kpi;
  if (aprOk)  payKpi += C.kpi;

  // Доплата за план
  let payPlan = 0;
  if (C.mode === 'scale') {
    // гаряча: бонус лише якщо ОБИДВА KPI виконані і є перевиконання
    if (srchOk && aprOk && pct > 100) payPlan = C.rate * ropHotOverPct(pct - 100) / 100;
  } else {
    // РЗПК / відмови: пропорційно, від 80%
    if (pct >= 80) payPlan = C.plan_bonus * pct / 100;
  }

  // Відсоток з особистих замовлень
let payOwn = 0;
  if (deptCode === 'hot') {
    payOwn = (parseFloat(r.own_hot) || 0) * 0.02 + (parseFloat(r.own_cold) || 0) * 0.05;
  } else {
    payOwn = (parseFloat(r.own_sum) || 0) * C.own_pct;
  }

  const bonus = parseFloat(r.bonus) || 0;
  const penalty = parseFloat(r.penalty) || 0;
  const total = C.rate + payKpi + payPlan + payOwn + bonus - penalty;

  return {
    scheme_type: 'rop', dept_code: deptCode,
    rate: C.rate, plan_target: planTarget, plan_fact: planFact,
    plan_pct: Math.round(pct * 10) / 10,
    srch_ok: srchOk, apr_ok: aprOk, kpi_each: C.kpi, pay_kpi: payKpi,
    pay_plan: payPlan, plan_bonus_max: C.plan_bonus,
    own_sum: parseFloat(r.own_sum) || 0,
    own_hot: parseFloat(r.own_hot) || 0,
    own_cold: parseFloat(r.own_cold) || 0,
    pay_own: payOwn, bonus, penalty, total,
  };
}

// ═══════════════════════════════════════════════════════════
// ГАРЯЧІ ПРОДАЖІ — розрахунок за період (1-14 або 15-кінець)
// Ставка: Інста(директ) 450×зміни; Дзвінки 350×зміни + 50×(години понад 7)
// Відсотки: офіс 2%, паста 2%, офіс2 (відмови/недзвін) 5%,
//           акція 230 — 2.5% якщо СРЧ>=1000, інакше 2%
// ═══════════════════════════════════════════════════════════
// Години зміни: спершу відомий статус зі словника, інакше парсимо довільний час "HH-HH"/"HH:MM-HH:MM"
// (щоб зміни, введені РОПом вручну через кнопку "Свій", теж рахувались)
function hotShiftHours(status) {
  if (STATUS_HOURS[status] != null) return STATUS_HOURS[status];
  const m = /^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/.exec(status || '');
  if (!m) return null;
  const sh = parseInt(m[1]), sm = m[2] ? parseInt(m[2]) : 0;
  const eh = parseInt(m[3]), em = m[4] ? parseInt(m[4]) : 0;
  let start = sh + sm / 60, end = eh + em / 60;
  if (end <= start) end += 24;
  return end - start;
}

function computeHotPeriod(entries, per, isInsta) {
  // зміни і понаднормові години з графіка
  let shifts = 0, extraHours = 0;
  (entries || []).forEach(e => {
    const hrs = hotShiftHours(e.status);
    if (hrs != null && hrs > 0) {
      shifts += 1;
      if (!isInsta && hrs > HOT_BASE_HOURS) extraHours += (hrs - HOT_BASE_HOURS);
    }
  });
  const rate = isInsta
    ? HOT_RATE_INSTA * shifts
    : HOT_RATE_CALLS * shifts + HOT_HOUR_EXTRA * extraHours;

  const p = per || {};
  const sOffice  = parseFloat(p.sum_office)  || 0;
  const sPasta   = parseFloat(p.sum_pasta)   || 0;
  const sOffice2 = parseFloat(p.sum_office2) || 0;
  const sAction  = parseFloat(p.sum_action)  || 0;
  const srch     = parseFloat(p.srch_action) || 0;
  const bonus    = parseFloat(p.bonus)   || 0;
  const penalty  = parseFloat(p.penalty) || 0;

  const actPct = srch >= HOT_SRCH_LIMIT ? HOT_PCT_ACTION_HI : HOT_PCT_ACTION_LO;
  const payOffice  = sOffice  * HOT_PCT_OFFICE;
  const payPasta   = sPasta   * HOT_PCT_PASTA;
  const payOffice2 = sOffice2 * HOT_PCT_OFFICE2;
  const payAction  = sAction  * actPct;

  const total = rate + payOffice + payPasta + payOffice2 + payAction + bonus - penalty;

  return {
    shifts, extra_hours: extraHours, rate, is_insta: isInsta,
    sum_office: sOffice, pay_office: payOffice,
    sum_pasta: sPasta, pay_pasta: payPasta,
    sum_office2: sOffice2, pay_office2: payOffice2,
    sum_action: sAction, srch_action: srch,
    action_pct: actPct * 100, pay_action: payAction,
    bonus, penalty, total,
  };
}

// Дати періоду: 1 = 1-14, 2 = 15-кінець місяця
    function periodRange(y, m, no) {
      const last = new Date(y, m, 0).getDate();
      const mm = String(m).padStart(2, '0');
      return no === 1
        ? { from: `${y}-${mm}-01`, to: `${y}-${mm}-14` }
        : { from: `${y}-${mm}-15`, to: `${y}-${mm}-${String(last).padStart(2,'0')}` };
    }

function computeFixedRate(scheme, entries, salRow, y, m, adjustments, startDate, employeeId) {
  const base = parseFloat(scheme.base_rate) || 0;
  const normType = scheme.norm_type || 'fixed';
  const dayPrice = base / 22;                        // ціна дня завжди /22
  // Персональний виняток: СБ (id=206) отримує всю ЗП одним платежем 1-го числа,
  // без поділу на аванс 15-го і залишок 1-го наст.
  const SINGLE_PAYOUT_IDS = [206];                   // ціна дня завжди /22
  // Новачок-ставочник: прийнятий у цьому місяці → платимо ЗА ВІДПРАЦЬОВАНІ ДНІ,
  // а не «оклад мінус пропуски» (інакше виходить занижена сума).
  const isNewStaff = isFirstMonthByStartDate(startDate, y, m);

  // еталон днів
  const targetDays = normType === 'month_workdays'
    ? monthWeekdays(y, m)
    : (parseInt(scheme.norm_days) || 22);

  // відпрацьовані зміни за графіком
  let worked = 0;
  entries.forEach(e => { if (isWorkStatus(e.status)) worked += 1; });

  const diff = worked - targetDays;                 // + переробка / − недопрацював
  const dayAdjust = diff * dayPrice;

  // корегування (зі знаком): сума всіх рядків
  const adjList = adjustments || [];
  const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

  // Новачок → відпрацьовані дні × ціна дня. Решта → оклад ± різниця днів.
  const total = isNewStaff
    ? (worked * dayPrice + adjTotal)
    : (base + dayAdjust + adjTotal);
  // Ставочники (адмінка, логістика, бухгалтерія, навчання, керівництво):
  //   Виплата 1 = АВАНС (15-те число поточного місяця) = половина окладу
  //   Виплата 2 = залишок ставки + допки (1-ше число наступного місяця)
  //   Аванс не може перевищувати підсумок (щоб виплата 2 не була від'ємною).
  let payout1 = base / 2;                      // аванс 15-го
  if (payout1 > total) payout1 = Math.max(0, total);
  let payout2 = Math.max(0, total - payout1); // залишок 1-го наст. місяця

  if (employeeId && SINGLE_PAYOUT_IDS.includes(employeeId)) {
    payout1 = 0;
    payout2 = total;
  }

  return {
    scheme_type: 'fixed_rate',
    norm_type: normType,
    base_rate: base,
    day_price: dayPrice,
    target_days: targetDays,
    worked_days: worked,
    diff_days: diff,
    day_adjust: dayAdjust,
    adj_total: adjTotal,
    adjustments: adjList,
    total,
    payout1,
    payout2,
    pay_schedule: 'staff',   // аванс 15-го, залишок 1-го наст. місяця
    advance: payout1,
    remainder: payout2,
  };
}

// ═══════════════════════════════════════════════════════════
// ДЕТАЛІЗАЦІЯ ЗП: розбити готовий рядок /api/finance на компоненти
// (ставка, кожен бонус окремо, корегування) — не чіпає total/payout1/payout2,
// лише читає вже пораховані поля з рядка.
// Повертає { components, adjustments, all } — components = ставка/бонуси
// по типу схеми, adjustments = ручні корегування (salary_adjustments) окремо,
// all = components.concat(adjustments) — зручно для суцільного списку в UI.
// Нулі й undefined пропускаються.
// ═══════════════════════════════════════════════════════════
function buildBreakdown(r) {
  const items = [];
  const push = (label, amount) => {
    if (amount === undefined || amount === null) return;
    const v = parseFloat(amount) || 0;
    if (v !== 0) items.push({ label, amount: v });
  };

  switch (r.scheme_type) {
    case 'fixed_rate':
      push('Оклад', r.base_rate);
      push(r.diff_days >= 0 ? 'Переробка' : 'Недопрацьовано', r.day_adjust);
      break;
    case 'warehouse_hybrid':
      push('Фікс (оклад ± переробка)', r.fix_total);
      push('Фасовка (скло/пластик)', r.piece_total);
      break;
    case 'piece_warehouse':
      push('Упаковка', r.pack_total);
      push('Фасовка', r.fas_total);
      push('Вихід', r.exit_total);
      break;
    case 'hourly':
      push('Години × ставка', r.hour_pay);
      break;
    case 'hourly_fixed':
      push('Фікс', r.fixed_amount);
      push('Години × ставка', r.hour_pay);
      break;
    case 'hot': {
      const p1 = r.period1 || {}, p2 = r.period2 || {};
      push('Ставка (1-14)', p1.rate);
      push('ОФІС1345 % (1-14)', p1.pay_office);
      push('Паста % (1-14)', p1.pay_pasta);
      push('ОФІС2 % (1-14)', p1.pay_office2);
      push('Акція230 % (1-14)', p1.pay_action);
      push('Доплата (1-14)', p1.bonus);
      push('Штраф (1-14)', p1.penalty ? -p1.penalty : 0);
      push('Ставка (15-кінець)', p2.rate);
      push('ОФІС1345 % (15-кінець)', p2.pay_office);
      push('Паста % (15-кінець)', p2.pay_pasta);
      push('ОФІС2 % (15-кінець)', p2.pay_office2);
      push('Акція230 % (15-кінець)', p2.pay_action);
      push('Доплата (15-кінець)', p2.bonus);
      push('Штраф (15-кінець)', p2.penalty ? -p2.penalty : 0);
      break;
    }
    case 'rop':
      push('Ставка', r.rate);
      push('KPI (СРЧ + апрув)', r.pay_kpi);
      push('Бонус за план', r.pay_plan);
      push('% з особистих замовлень', r.pay_own);
      push('Доплата', r.bonus);
      push('Штраф', r.penalty ? -r.penalty : 0);
      break;
    case 'percent_plan':
    case 'orders_count':
      if (r.advance_stage) {
        push('Аванс', r.advance);
        break;
      }
      push('Ставка', r.rate);
      push(`% від обороту (${r.bonus_pct}%)`, r.bonus);
      push('Переробка', r.overtime);
      push('Навчання', r.train_pay);
      push('Доплата', r.senior_bonus);
      push('Штраф', r.penalty ? -r.penalty : 0);
      break;
    case 'mentor':
      push('Оклад (± переробка)', r.fix_total);
      push('Бонус за якість тесту', r.quality_bonus);
      push('Бонус за ІЕ групи', r.ie_bonus);
      break;
    case 'recruiter':
      push('Оклад (± переробка)', r.fix_total);
      push('Кандидати на навчання', r.train_bonus);
      push('Кандидати у продажі', r.sales_bonus);
      push('Адмін-доплата', r.admin_bonus);
      break;
    default:
      break;
  }

  const adjItems = [];
  (r.adjustments || []).forEach(a => {
    const amount = parseFloat(a.amount) || 0;
    if (amount === 0) return;
    adjItems.push({ label: a.comment || a.type || 'Корегування', amount });
  });

  return { components: items, adjustments: adjItems, all: items.concat(adjItems) };
}

// ═══════════════════════════════════════════════════════════
// СТАТУС ВИПЛАТ (для бухгалтера): галочка «виплачено» + ручна сума
// payout_no: 1 = перша виплата (аванс), 2 = друга (залишок)
// amount_override: якщо задано — використовується замість розрахованої
// ═══════════════════════════════════════════════════════════
app.get('/api/payout-status', requireFinance, async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    res.json(await q(
      `SELECT * FROM payout_status WHERE calc_year=$1 AND calc_month=$2`, [y, m]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/payout-status', requireFinance, async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, payout_no, paid, comment } = req.body;
    const overrideProvided = Object.prototype.hasOwnProperty.call(req.body, 'amount_override');
    const overrideVal = (req.body.amount_override === '' || req.body.amount_override == null) ? null : req.body.amount_override;

    // якщо виплата вже позначена «виплачено» — сума заблокована від редагування,
    // поки хтось явно не зніме галочку (paid=false) в цьому ж запиті
    if (overrideProvided) {
      const existing = await q(
        `SELECT paid FROM payout_status WHERE employee_id=$1 AND calc_year=$2 AND calc_month=$3 AND payout_no=$4`,
        [employee_id, calc_year, calc_month, payout_no]
      );
      if (existing.length && existing[0].paid && paid === true) {
        return res.status(403).json({ error: 'Сума заблокована — спочатку зніміть галочку "виплачено", щоб редагувати' });
      }
    }

    const rows = await q(
      `INSERT INTO payout_status (employee_id, calc_year, calc_month, payout_no, paid, amount_override, paid_at, comment, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $5 THEN NOW() ELSE NULL END, $7, NOW())
       ON CONFLICT (employee_id, calc_year, calc_month, payout_no)
       DO UPDATE SET paid=$5,
                     amount_override = CASE WHEN $8 THEN $6 ELSE payout_status.amount_override END,
                     paid_at = CASE WHEN $5 THEN COALESCE(payout_status.paid_at, NOW()) ELSE NULL END,
                     comment=$7, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, payout_no,
       paid === true, overrideVal, comment || null, overrideProvided]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// СТАТУС «ВИДАНО В КОНВЕРТІ» для корегувань (готівкою, окремо від
// основних виплат) — один прапорець на співробітника/місяць
// (корегувань може бути кілька рядків, але позначаємо сумарно).
// ═══════════════════════════════════════════════════════════
app.put('/api/correction-payout-status', requireFinance, async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, paid } = req.body;
    const rows = await q(
      `INSERT INTO correction_payout_status (employee_id, calc_year, calc_month, paid, paid_at, updated_at)
       VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET paid=$4, paid_at = CASE WHEN $4 THEN COALESCE(correction_payout_status.paid_at, NOW()) ELSE NULL END, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, paid === true]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ГАРЯЧІ ПРОДАЖІ — суми по категоріях за період (вводить РОП)
// period_no: 1 = 1-14 (виплата 15-го), 2 = 15-кінець (виплата 1-го)
// ═══════════════════════════════════════════════════════════
app.get('/api/salary-period', async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM salary_period WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (req.query.employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(req.query.employee_id)); }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/salary-period', requireAuth, async (req, res) => {
  try {
    if (!req.user.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
    const { employee_id, calc_year, calc_month, period_no,
            sum_office, sum_pasta, sum_office2, sum_action, srch_action,
            bonus, penalty, note } = req.body;
    const rows = await q(
      `INSERT INTO salary_period (employee_id, calc_year, calc_month, period_no,
         sum_office, sum_pasta, sum_office2, sum_action, srch_action, bonus, penalty, note, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month, period_no)
       DO UPDATE SET sum_office=$5, sum_pasta=$6, sum_office2=$7, sum_action=$8,
                     srch_action=$9, bonus=$10, penalty=$11, note=$12, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, period_no,
       sum_office||0, sum_pasta||0, sum_office2||0, sum_action||0, srch_action||0,
       bonus||0, penalty||0, note||null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Легкий розрахунок гарячих продажів для картки співробітника
// (доступно всім, хто має can_salary на відділ hot — не потребує can_finance)
app.get('/api/hot-calc', requireAuth, async (req, res) => {
  try {
    const employeeId = parseInt(req.query.employee_id);
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    const empRows = await q(
      `SELECT e.id, e.name, e.start_date, d.code AS dept_code
       FROM employees e JOIN departments d ON d.id = e.department_id
       WHERE e.id = $1`, [employeeId]);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ error: 'Співробітник не знайдений' });
    if (!canDept(req.user, emp.dept_code)) return res.status(403).json({ error: 'Немає доступу' });

    const isInsta = (emp.name === 'Желюбовська Анастасія' || emp.name === 'Галаєва Анна');
    const last = new Date(y, m, 0).getDate();
    const sched = await q(
      `SELECT entry_date, status FROM schedule_entries WHERE employee_id=$1 AND entry_date >= $2 AND entry_date <= $3`,
      [employeeId, `${y}-${String(m).padStart(2,'0')}-01`, `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`]);
    const savedList = sched.map(r => ({
      entry_date: r.entry_date.toISOString ? r.entry_date.toISOString().slice(0,10) : String(r.entry_date).slice(0,10),
      status: r.status
    }));
    const monthEntries = buildMonthEntries(y, m, savedList, emp.dept_code, emp.name, emp.start_date);

    const pRows = await q(`SELECT * FROM salary_period WHERE employee_id=$1 AND calc_year=$2 AND calc_month=$3`, [employeeId, y, m]);
    const ps = {}; pRows.forEach(r => { ps[r.period_no] = r; });

    const r1 = periodRange(y, m, 1), r2 = periodRange(y, m, 2);
    const ent1 = monthEntries.filter(e => e.entry_date >= r1.from && e.entry_date <= r1.to);
    const ent2 = monthEntries.filter(e => e.entry_date >= r2.from && e.entry_date <= r2.to);
    const c1 = computeHotPeriod(ent1, ps[1], isInsta);
    const c2 = computeHotPeriod(ent2, ps[2], isInsta);
    res.json({ period1: c1, period2: c2 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── РОП: дані мотивації (вводить РОП або комерційний директор) ──
app.get('/api/rop-salary', async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM rop_salary WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (req.query.employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(req.query.employee_id)); }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rop-salary', requireAuth, async (req, res) => {
  try {
    if (!req.user.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
    const { employee_id, calc_year, calc_month, plan_target, plan_fact,
            srch_ok, apr_ok, own_sum, own_hot, own_cold, bonus, penalty, note } = req.body;
    const empRow = await q(`SELECT d.code FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.id=$1`, [employee_id]);
    if (empRow.length && !canDept(req.user, empRow[0].code))
      return res.status(403).json({ error: 'Немає доступу до цього відділу' });
    const rows = await q(
      `INSERT INTO rop_salary (employee_id, calc_year, calc_month, plan_target, plan_fact,
         srch_ok, apr_ok, own_sum, own_hot, own_cold, bonus, penalty, note, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET plan_target=$4, plan_fact=$5, srch_ok=$6, apr_ok=$7,
                     own_sum=$8, own_hot=$9, own_cold=$10, bonus=$11, penalty=$12,
                     note=$13, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, plan_target||0, plan_fact||0,
       srch_ok===true, apr_ok===true, own_sum||0, own_hot||0, own_cold||0,
       bonus||0, penalty||0, note||null]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// — Наставник: середній бал тесту + ІЕ групи —
app.get('/api/mentor-salary', async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM mentor_salary WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (req.query.employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(req.query.employee_id)); }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/mentor-salary', requireAuth, async (req, res) => {
  try {
    if (!req.user.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
    const { employee_id, calc_year, calc_month, avg_score, group_ie } = req.body;
    const empRow = await q(`SELECT d.code FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.id=$1`, [employee_id]);
    if (empRow.length && !canDept(req.user, empRow[0].code))
      return res.status(403).json({ error: 'Немає доступу до цього відділу' });
    const rows = await q(
      `INSERT INTO mentor_salary (employee_id, calc_year, calc_month, avg_score, group_ie, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET avg_score=$4, group_ie=$5, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, avg_score||0, group_ie||0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// — Рекрутер (Саєнко Аліна): кандидати на навчання/продажі + доплата адмін —
app.get('/api/recruiter-salary', async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    let sql = `SELECT * FROM recruiter_salary WHERE calc_year=$1 AND calc_month=$2`;
    const params = [y, m];
    if (req.query.employee_id) { sql += ` AND employee_id=$3`; params.push(parseInt(req.query.employee_id)); }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/recruiter-salary', requireAuth, async (req, res) => {
  try {
    if (!req.user.can_salary) return res.status(403).json({ error: 'Немає доступу до ЗП' });
    const { employee_id, calc_year, calc_month, train_candidates, sales_candidates, admin_bonus } = req.body;
    const empRow = await q(`SELECT d.code FROM employees e JOIN departments d ON d.id=e.department_id WHERE e.id=$1`, [employee_id]);
    if (empRow.length && !canDept(req.user, empRow[0].code))
      return res.status(403).json({ error: 'Немає доступу до цього відділу' });
    const rows = await q(
      `INSERT INTO recruiter_salary (employee_id, calc_year, calc_month, train_candidates, sales_candidates, admin_bonus, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET train_candidates=$4, sales_candidates=$5, admin_bonus=$6, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, train_candidates||0, sales_candidates||0, admin_bonus||0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// GET /api/finance?year=2026&month=9[&dept=admin]
// Повертає порахований підсумок ЗП по кожному ставочнику + агрегати по відділах
// ═══════════════════════════════════════════════════════════
// Побудова рядків фінансового розрахунку за місяць (усі схеми ЗП,
// з деталізацією по компонентах). Використовується і в /api/finance,
// і в /api/export/salary — щоб суми в дашборді й в експорті завжди
// збігались (одна логіка розрахунку, не дублюємо формули).
// ═══════════════════════════════════════════════════════════
async function computeFinanceRows(y, m, dept) {
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);

    // всі активні співробітники зі схемою fixed_rate
    let empSql = `SELECT e.id, e.name, e.level, e.role, e.start_date,
                         d.id AS dept_id, d.code AS dept_code, d.name AS dept_name,
                         s.scheme_type, s.base_rate, s.norm_days, s.norm_type, s.fixed_amount
                  FROM employees e
                  JOIN departments d ON d.id = e.department_id
                  LEFT JOIN salary_schemes s ON s.employee_id = e.id
                  WHERE (e.is_active = true OR EXISTS (
                    SELECT 1 FROM schedule_entries se2
                    WHERE se2.employee_id = e.id AND se2.entry_date BETWEEN $1 AND $2
                  AND se2.status IS NOT NULL AND se2.status NOT IN ('', '-', 'звіл.', 'звіл')
              ))`;
    const params = [start, end];
    if (dept) { empSql += ` AND d.code = $${params.length + 1}`; params.push(dept); }
    empSql += ` ORDER BY d.id, e.name`;
    const emps = await q(empSql, params);

    // графік за місяць
    const sched = await q(
      `SELECT se.employee_id, se.entry_date, se.status
       FROM schedule_entries se
       JOIN employees e ON e.id = se.employee_id
       WHERE se.entry_date BETWEEN $1 AND $2 AND e.is_active = true`,
      [start, end]
    );
    const schedByEmp = {};
    sched.forEach(r => {
      (schedByEmp[r.employee_id] = schedByEmp[r.employee_id] || [])
        .push({ entry_date: r.entry_date.toISOString ? r.entry_date.toISOString().slice(0,10) : String(r.entry_date).slice(0,10), status: r.status });
    });

    // хто мав реальні робочі дні ДО цього місяця (для визначення "перший місяць")
    const priorRows = await q(
      `SELECT DISTINCT se.employee_id
       FROM schedule_entries se
       JOIN employees e ON e.id = se.employee_id
       WHERE se.entry_date < $1 AND e.is_active = true
         AND se.status IS NOT NULL AND se.status <> '' AND se.status <> '-'`,
      [start]
    );
    const hadPrior = new Set(priorRows.map(r => r.employee_id));

    // збережені ручні дані (премія/штраф)
    const sal = await q(
      `SELECT * FROM salary_calc WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
    const salByEmp = {};
    sal.forEach(s => { salByEmp[s.employee_id] = s; });

    // корегування ЗП за місяць
    const adjs = await q(
      `SELECT * FROM salary_adjustments WHERE calc_year=$1 AND calc_month=$2 ORDER BY created_at`, [y, m]);
    const adjByEmp = {};
    adjs.forEach(a => { (adjByEmp[a.employee_id] = adjByEmp[a.employee_id] || []).push(a); });

    // склад — всі щоденні дані за місяць
    const whRows = await q(
      `SELECT * FROM warehouse_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);
    const whByEmp = {};
    whRows.forEach(r => { (whByEmp[r.employee_id] = whByEmp[r.employee_id] || []).push(r); });

    // склад — години вантажників
    const hrRows = await q(
      `SELECT * FROM hourly_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);
    const hrByEmp = {};
    hrRows.forEach(r => { (hrByEmp[r.employee_id] = hrByEmp[r.employee_id] || []).push(r); });

    // РОП — дані мотивації
    let ropRows = [];
    try { ropRows = await q(`SELECT * FROM rop_salary WHERE calc_year=$1 AND calc_month=$2`, [y, m]); }
    catch (e) { ropRows = []; }
    const ropByEmp = {};
    ropRows.forEach(r => { ropByEmp[r.employee_id] = r; });

    // Наставник — середній бал тесту / ІЕ групи
    let mentorRows = [];
    try { mentorRows = await q(`SELECT * FROM mentor_salary WHERE calc_year=$1 AND calc_month=$2`, [y, m]); }
    catch (e) { mentorRows = []; }
    const mentorByEmp = {};
    mentorRows.forEach(r => { mentorByEmp[r.employee_id] = r; });

    // Рекрутер — кандидати на навчання/продажі + доплата адмін
    let recruiterRows = [];
    try { recruiterRows = await q(`SELECT * FROM recruiter_salary WHERE calc_year=$1 AND calc_month=$2`, [y, m]); }
    catch (e) { recruiterRows = []; }
    const recruiterByEmp = {};
    recruiterRows.forEach(r => { recruiterByEmp[r.employee_id] = r; });
    // гарячі продажі — суми по періодах
    let perRows = [];
    try {
      perRows = await q(`SELECT * FROM salary_period WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
    } catch (e) { perRows = []; }
    const perByEmp = {};
    perRows.forEach(p => { (perByEmp[p.employee_id] = perByEmp[p.employee_id] || {})[p.period_no] = p; });

    // статуси виплат (галочка бухгалтера + ручні суми)
    let payStat = [];
    try {
      payStat = await q(`SELECT * FROM payout_status WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
    } catch (e) { payStat = []; }   // таблиці ще нема — не падаємо
    const payByEmp = {};
    payStat.forEach(p => {
      (payByEmp[p.employee_id] = payByEmp[p.employee_id] || {})[p.payout_no] = p;
    });

    const rows = emps.map(emp => {
      // гібрид начальника складу: фікс (як логісти, 40000/22) + фасовка (скло/пластик) + корегування
      if (emp.scheme_type === 'warehouse_hybrid') {
        // фікс-частина: computeFixedRate з базою base_rate, norm_type='fixed' (норма 22)
        const monthEntries = buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date);
        const fixScheme = { base_rate: emp.base_rate, norm_days: emp.norm_days || 22, norm_type: emp.norm_type || 'fixed' };
        const fixCalc = computeFixedRate(fixScheme, monthEntries, salByEmp[emp.id], y, m, [], emp.start_date); // корегування додаємо нижче окремо
        // фасовка за місяць (тільки скло/пластик)
        const list = whByEmp[emp.id] || [];
        let fasTotal = 0, fasDays = 0;
        list.forEach(r => { const a = fasovkaDayAmount(r); if (a > 0) { fasTotal += a; fasDays += 1; } });
        // корегування
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        // total = фікс(±дні) + фасовка + корегування
        const base = parseFloat(emp.base_rate) || 0;
        const total = fixCalc.total + fasTotal + adjTotal;
        // виплати: 2 (10-15) = base/2 фікс; 1 (1-5) = решта (фікс-допки + фасовка + корегування)
        const payout1 = base / 2;        // аванс 15-го
        const payout2 = total - payout1;  // залишок 1-го наст. місяця
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'warehouse_hybrid',
          norm_type: fixScheme.norm_type,
          base_rate: base,
          day_price: fixCalc.day_price,
          target_days: fixCalc.target_days,
          worked_days: fixCalc.worked_days,
          diff_days: fixCalc.diff_days,
          day_adjust: fixCalc.day_adjust,
          fix_total: fixCalc.total,
          piece_total: fasTotal,     // фасовка за місяць
          fas_days: fasDays,
          adj_total: adjTotal, adjustments: adjList,
          total, payout1, payout2,
          pay_schedule: 'staff',
          advance: payout1, remainder: payout2,
        };
      }
      // склад-відрядник: сума за днями
      if (emp.scheme_type === 'piece_warehouse') {
        const list = whByEmp[emp.id] || [];
        let whTotal = 0, packTotal = 0, fasTotal = 0, exitTotal = 0;
        list.forEach(r => {
          const a = warehouseDayAmount(r);
          whTotal += a.total; packTotal += a.pack; fasTotal += a.fasovka; exitTotal += a.exit;
        });
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total = whTotal + adjTotal;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'piece_warehouse',
          base_rate: 0, worked_days: list.length, diff_days: 0,
          piece_total: whTotal,
          pack_total: packTotal, fas_total: fasTotal, exit_total: exitTotal,
          adj_total: adjTotal, adjustments: adjList,
          total, advance: 0, remainder: total,
        };
      }
      // вантажник: години × ставка
      if (emp.scheme_type === 'hourly') {
        const rate = parseFloat(emp.base_rate) || 150;
        const list = hrByEmp[emp.id] || [];
        let hours = 0; list.forEach(r => hours += parseFloat(r.hours) || 0);
        const hourPay = hours * rate;
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total = hourPay + adjTotal;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'hourly',
          base_rate: rate, worked_days: list.length, diff_days: 0,
          hours_total: hours, hour_pay: hourPay,
          adj_total: adjTotal, adjustments: adjList,
          total, advance: 0, remainder: total,
        };
      }
      // ГАРЯЧІ ПРОДАЖІ — окрема схема: два незалежні періоди
      // (керівні ролі сюди НЕ потрапляють — у РОПа своя мотивація нижче)
      if (emp.dept_code === 'hot' && !['rop','head','teamlead'].includes(emp.role)) {
        const isInsta = (emp.name === 'Желюбовська Анастасія' || emp.name === 'Галаєва Анна');
        const monthEntries = buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date);
        const ps = perByEmp[emp.id] || {};
        const r1 = periodRange(y, m, 1), r2 = periodRange(y, m, 2);
        const ent1 = monthEntries.filter(e => e.entry_date >= r1.from && e.entry_date <= r1.to);
        const ent2 = monthEntries.filter(e => e.entry_date >= r2.from && e.entry_date <= r2.to);
        const c1 = computeHotPeriod(ent1, ps[1], isInsta);
        const c2 = computeHotPeriod(ent2, ps[2], isInsta);
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total = c1.total + c2.total + adjTotal;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'hot',
          is_insta: isInsta,
          period1: c1, period2: c2,
          worked_days: c1.shifts + c2.shifts,
          adj_total: adjTotal, adjustments: adjList,
          total,
          payout1: c1.total,          // виплата 15-го (за 1-14)
          payout2: c2.total + adjTotal, // виплата 1-го наст. (за 15-кінець)
          pay_schedule: 'hot',
          advance: c1.total, remainder: c2.total,
        };
      }
      // продажі / відмови: рахуємо із збереженого salary_calc
      if (SALES_DEPTS.includes(emp.dept_code) || ORDER_DEPTS.includes(emp.dept_code)) {
        if (['rop','head','teamlead'].includes(emp.role)) {
          // РОП відділів продажів — своя мотивація
          if (emp.role === 'rop' && ROP_CFG[emp.dept_code]) {
            const rc = computeRopSalary(emp.dept_code, ropByEmp[emp.id]);
            const adjList = adjByEmp[emp.id] || [];
            const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
            const total = rc.total + adjTotal;
            const payout1 = ROP_CFG[emp.dept_code].rate / 2;   // аванс 1-го = половина ставки
            return {
              employee_id: emp.id, name: emp.name,
              dept_code: emp.dept_code, dept_name: emp.dept_name,
              role: emp.role, level: emp.level,
              ...rc,
              adj_total: adjTotal, adjustments: adjList,
              total, payout1, payout2: Math.max(0, total - payout1),
              pay_schedule: 'sales',
              advance: payout1, remainder: Math.max(0, total - payout1),
            };
          }
          return {
            employee_id: emp.id, name: emp.name,
            dept_code: emp.dept_code, dept_name: emp.dept_name,
            role: emp.role, level: emp.level, scheme_type: 'sales',
            total: null, advance: null, remainder: null, note: 'керівна роль',
          };
        }
        const isOrder = ORDER_DEPTS.includes(emp.dept_code);
        // дані з графіка місяця: відпрацьовані зміни + дні навчання + чи перший місяць
        const monthEntries = buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date);
        const { worked: workedGraph, train: trainDays } = countWorkAndTrain(monthEntries);
        // Новачок: дата прийому в цьому місяці АБО (дата не задана + є навчання + не працював раніше)
        const isFirst = isFirstMonthByStartDate(emp.start_date, y, m)
          || (!emp.start_date && trainDays > 0 && !hadPrior.has(emp.id));
        // computeSalesSalary тепер завжди повертає результат:
        //  • оборот=0 → лише аванс (виплата 1), total/payout2 = null (стадія авансу 31 числа)
        //  • оборот введено → повний розрахунок з розбивкою на 2 виплати
        const sc = computeSalesSalary(salByEmp[emp.id], isOrder,
          { workedFromGraph: workedGraph, trainDays, isFirstMonth: isFirst });
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: isOrder ? 'orders_count' : 'percent_plan',
          ...sc,
        };
      }
     if (emp.scheme_type === 'mentor') {
        const monthEntries = buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date);
        const fixScheme = { base_rate: emp.base_rate, norm_days: emp.norm_days, norm_type: emp.norm_type };
        const fixCalc = computeFixedRate(fixScheme, monthEntries, salByEmp[emp.id], y, m, [], emp.start_date);
        const mRow = mentorByEmp[emp.id] || {};
        const avgScore = parseFloat(mRow.avg_score) || 0;
        const groupIe = parseFloat(mRow.group_ie) || 0;
        const qBonus = mentorQualityBonus(avgScore);
        const iBonus = mentorIeBonus(groupIe);
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total = fixCalc.total + qBonus + iBonus + adjTotal;
        const payout1 = fixCalc.payout1;
        const payout2 = total - payout1;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'mentor',
          base_rate: emp.base_rate, worked_days: fixCalc.worked_days, diff_days: fixCalc.diff_days,
          fix_total: fixCalc.total,
          avg_score: avgScore, group_ie: groupIe,
          quality_bonus: qBonus, ie_bonus: iBonus,
          adj_total: adjTotal, adjustments: adjList,
          total, payout1, payout2,
          pay_schedule: 'staff',
          advance: payout1, remainder: payout2,
        };
      }
      if (emp.scheme_type === 'recruiter') {
        const monthEntries = buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date);
        const fixScheme = { base_rate: emp.base_rate, norm_days: emp.norm_days, norm_type: emp.norm_type };
        const fixCalc = computeFixedRate(fixScheme, monthEntries, salByEmp[emp.id], y, m, [], emp.start_date);
        const rRow = recruiterByEmp[emp.id] || {};
        const trainCandidates = parseInt(rRow.train_candidates) || 0;
        const salesCandidates = parseInt(rRow.sales_candidates) || 0;
        const adminBonus = parseFloat(rRow.admin_bonus) || 0;
        const trainBonus = trainCandidates * 200;
        const salesBonus = salesCandidates * 600;
        const adjList = adjByEmp[emp.id] || [];
        const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total = fixCalc.total + trainBonus + salesBonus + adminBonus + adjTotal;
        const payout1 = fixCalc.payout1;
        const payout2 = total - payout1;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'recruiter',
          base_rate: emp.base_rate, worked_days: fixCalc.worked_days, diff_days: fixCalc.diff_days,
          fix_total: fixCalc.total,
          train_candidates: trainCandidates, sales_candidates: salesCandidates,
          train_bonus: trainBonus, sales_bonus: salesBonus, admin_bonus: adminBonus,
          adj_total: adjTotal, adjustments: adjList,
          total, payout1, payout2,
          pay_schedule: 'staff',
          advance: payout1, remainder: payout2,
        };
      }
      // вантажник з фіксом: 5000 завжди (незалежно від графіка) + години × ставка
      if (emp.scheme_type === 'hourly_fixed') {
        const rate = parseFloat(emp.base_rate) || 150;
        const fixedAmount = parseFloat(emp.fixed_amount) || 0;
        const list = hrByEmp[emp.id] || [];
        let hours = 0; list.forEach(r => hours += parseFloat(r.hours) || 0);
        const hourPay = hours * rate;
        const adjList2 = adjByEmp[emp.id] || [];
        const adjTotal2 = adjList2.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        const total2 = fixedAmount + hourPay + adjTotal2;
        const payout1b = fixedAmount / 2;
        const payout2b = total2 - payout1b;
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: 'hourly_fixed',
          base_rate: rate, fixed_amount: fixedAmount,
          worked_days: list.length, diff_days: 0,
          hours_total: hours, hour_pay: hourPay,
          adj_total: adjTotal2, adjustments: adjList2,
          total: total2, payout1: payout1b, payout2: payout2b,
          pay_schedule: 'staff',
          advance: payout1b, remainder: payout2b,
        };
      }
      const scheme = { base_rate: emp.base_rate, norm_days: emp.norm_days, norm_type: emp.norm_type };
      const hasScheme = emp.scheme_type === 'fixed_rate' && emp.base_rate > 0;
      if (!hasScheme) {
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: emp.scheme_type || null,
          total: null, advance: null, remainder: null,
          note: emp.scheme_type ? 'інша схема' : 'оклад не задано',
        };
      }
      const calc = computeFixedRate(scheme,
        buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date),
        salByEmp[emp.id], y, m, adjByEmp[emp.id], emp.start_date);
      return {
        employee_id: emp.id, name: emp.name,
        dept_code: emp.dept_code, dept_name: emp.dept_name,
        role: emp.role, level: emp.level,
        start_date: emp.start_date,
        ...calc,
      };
    });

    // авансові виплати заздалегідь — зменшують payout1 (а якщо не вистачає — і payout2),
    // не змінюючи саму ставку/total
    const advRows = await q(
      `SELECT employee_id, SUM(amount) AS total FROM advance_payments
       WHERE calc_year=$1 AND calc_month=$2 GROUP BY employee_id`, [y, m]);
    const advByEmp = {};
    advRows.forEach(a => { advByEmp[a.employee_id] = parseFloat(a.total) || 0; });

    rows.forEach(r => {
      const adv = advByEmp[r.employee_id] || 0;
      r.advance_taken = adv;
      if (adv > 0 && r.payout1 != null) {
        r.payout1_before_advance = r.payout1;
        const leftover = Math.max(0, adv - r.payout1);
        r.payout1 = Math.max(0, r.payout1 - adv);
        if (leftover > 0 && r.payout2 != null) {
          r.payout2_before_advance = r.payout2;
          r.payout2 = Math.max(0, r.payout2 - leftover);
        }
      }
    });

    // деталізація по компонентах (ставка, кожен бонус, корегування) — не чіпає total/payout1/payout2
    rows.forEach(r => {
      const b = buildBreakdown(r);
      r.breakdown = b.all;                 // суцільний список (для UI)
      r.breakdown_components = b.components; // без корегувань (для експорту в колонки)
    });

    return rows;
}

app.get('/api/finance', requireFinance, async (req, res) => {
  try {
    const { year, month, dept } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    // якщо в юзера обмежений список відділів — не даємо запросити чужий dept напряму
    if (req.user.depts && dept && !req.user.depts.includes(dept)) {
      return res.status(403).json({ error: 'Немає доступу до цього відділу' });
    }
    let rows = await computeFinanceRows(y, m, dept);
    // без обмеження в user.depts — фінанси повні; з обмеженням — тільки дозволені відділи
    if (req.user.depts) {
      rows = rows.filter(r => req.user.depts.includes(r.dept_code));
    }
    // статуси виплат (галочка бухгалтера + ручні суми)
    let payStat = [];
    try {
      payStat = await q(`SELECT * FROM payout_status WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
    } catch (e) { payStat = []; }   // таблиці ще нема — не падаємо
    const payByEmp = {};
    payStat.forEach(p => {
      (payByEmp[p.employee_id] = payByEmp[p.employee_id] || {})[p.payout_no] = p;
    });

    // статус «видано в конверті» для корегувань
    let corrStat = [];
    try {
      corrStat = await q(`SELECT * FROM correction_payout_status WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
    } catch (e) { corrStat = []; }
    const corrByEmp = {};
    corrStat.forEach(c => { corrByEmp[c.employee_id] = c; });

    // приклеїти статуси виплат + ручні суми (override має пріоритет)
    rows.forEach(r => {
      const ps = payByEmp[r.employee_id] || {};
      const p1 = ps[1], p2 = ps[2];
      r.paid1 = !!(p1 && p1.paid);
      r.paid2 = !!(p2 && p2.paid);
      r.paid1_at = p1?.paid_at || null;
      r.paid2_at = p2?.paid_at || null;
      r.override1 = p1 && p1.amount_override != null ? parseFloat(p1.amount_override) : null;
      r.override2 = p2 && p2.amount_override != null ? parseFloat(p2.amount_override) : null;
      // фактична сума до виплати: ручна, якщо задана
      r.pay1 = r.override1 != null ? r.override1 : r.payout1;
      r.pay2 = r.override2 != null ? r.override2 : r.payout2;
      // чи видано корегування окремо в конверті
      r.corr_paid = !!(corrByEmp[r.employee_id] && corrByEmp[r.employee_id].paid);
    });
    // агрегати по відділах (лише ті, у кого порахувалось) + скільки ще «на авансі»
    // (виплата 1 вже є, а total ще null — оборот не внесено)
    const deptPeople = {};
    rows.forEach(r => {
      if (r.payout1 == null && r.total == null) return; // немає жодних даних (керівна роль тощо)
      const p = deptPeople[r.dept_code] = deptPeople[r.dept_code] || { dept_code: r.dept_code, dept_name: r.dept_name, total_people: 0, pending: 0 };
      p.total_people += 1;
      if (r.total == null) p.pending += 1;
    });

    const deptAgg = {};
    rows.forEach(r => {
      if (r.total == null) return;
      const a = deptAgg[r.dept_code] = deptAgg[r.dept_code] || {
        dept_code: r.dept_code, dept_name: r.dept_name,
        count: 0, sum: 0, min: Infinity, max: -Infinity,
      };
      a.count += 1; a.sum += r.total;
      a.min = Math.min(a.min, r.total);
      a.max = Math.max(a.max, r.total);
    });
    const depts = Object.values(deptAgg).map(a => ({
      ...a,
      avg: a.count ? a.sum / a.count : 0,
      min: a.min === Infinity ? 0 : a.min,
      max: a.max === -Infinity ? 0 : a.max,
      pending: deptPeople[a.dept_code]?.pending || 0,
    }));
    // відділи, де ЖОДЕН total ще не порахований — інакше вони зникають зі зведення повністю
    Object.values(deptPeople).forEach(p => {
      if (!deptAgg[p.dept_code]) {
        depts.push({
          dept_code: p.dept_code, dept_name: p.dept_name,
          count: 0, sum: 0, avg: 0, min: 0, max: 0,
          pending: p.pending, all_pending: true,
        });
      }
    });

    res.json({ year: y, month: m, rows, depts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/finance/warehouse-weeks?year=&month=
// Понедільна розбивка складу (пн-нд, тижні обриваються кінцем місяця).
// Дата виплати = наступний понеділок після кінця тижня.
app.get('/api/finance/warehouse-weeks', requireFinance, async (req, res) => {
  try {
    const y = parseInt(req.query.year || new Date().getFullYear());
    const m = parseInt(req.query.month || new Date().getMonth() + 1);
    const daysInMonth = new Date(y, m, 0).getDate();

    // нарізка на тижні пн-нд у межах місяця
    const weeks = [];
    let d = 1;
    while (d <= daysInMonth) {
      const startDay = d;
      // знайти найближчу неділю (dow=0) або кінець місяця
      let endDay = d;
      while (endDay < daysInMonth) {
        const dow = new Date(y, m - 1, endDay).getDay();
        if (dow === 0) break;         // неділя — кінець тижня
        endDay++;
      }
      weeks.push({ startDay, endDay });
      d = endDay + 1;
    }

    // склад-співробітники (piece_warehouse + hourly + hourly_fixed + warehouse_hybrid)
    const emps = await q(
      `SELECT e.id, e.name, s.scheme_type, s.base_rate
       FROM employees e
       JOIN salary_schemes s ON s.employee_id = e.id
       WHERE e.is_active = true AND s.scheme_type IN ('piece_warehouse','hourly','hourly_fixed','warehouse_hybrid')
       ORDER BY e.name`);
    // мапа схем для правильного підрахунку (гібрид рахує ТІЛЬКИ фасовку у тижнях)
    const schemeById = {}; emps.forEach(e => { schemeById[e.id] = e.scheme_type; });

    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
    const wh = await q(`SELECT * FROM warehouse_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);
    const hr = await q(`SELECT * FROM hourly_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);

    // компоненти суми по співробітнику по днях (щоб і сума, і деталізація
    // рахувались з тих самих чисел — сума в тижні не зміниться)
    const dayComp = {}; // "empId_day" -> {pack,fasovka,exit,hourPay,hours}
    const addComp = (key, patch) => {
      const c = dayComp[key] = dayComp[key] || { pack: 0, fasovka: 0, exit: 0, hourPay: 0, hours: 0 };
      Object.keys(patch).forEach(k => { c[k] += patch[k]; });
    };
    wh.forEach(r => {
      const day = parseInt(String(r.work_date).slice(8,10));
      const key = `${r.employee_id}_${day}`;
      // для гібрида (начальник складу) — лише фасовка; для відрядників — повна сума дня
      if (schemeById[r.employee_id] === 'warehouse_hybrid') {
        addComp(key, { pack: 0, fasovka: fasovkaDayAmount(r), exit: 0, hourPay: 0, hours: 0 });
      } else {
        const calc = warehouseDayAmount(r);
        addComp(key, { pack: calc.pack, fasovka: calc.fasovka, exit: calc.exit, hourPay: 0, hours: 0 });
      }
    });
    hr.forEach(r => {
      const emp = emps.find(e => e.id === r.employee_id);
      const rate = emp ? (parseFloat(emp.base_rate)||150) : 150;
      const day = parseInt(String(r.work_date).slice(8,10));
      const key = `${r.employee_id}_${day}`;
      const hours = parseFloat(r.hours)||0;
      addComp(key, { pack: 0, fasovka: 0, exit: 0, hourPay: hours*rate, hours });
    });

    const fmt = dd => `${String(dd).padStart(2,'0')}.${String(m).padStart(2,'0')}`;
    const payDateObj = endDay => {
      // наступний понеділок після endDay
      let dt = new Date(y, m - 1, endDay);
      dt.setDate(dt.getDate() + 1);
      while (dt.getDay() !== 1) dt.setDate(dt.getDate() + 1);
      return dt;
    };
    const payDate = endDay => {
      const dt = payDateObj(endDay);
      return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}`;
    };
    const payDateIso = endDay => payDateObj(endDay).toISOString().slice(0, 10);

    // всі дати виплат цього місяця — одним запитом підтягнути статус "виплачено"
    const payDateIsos = [...new Set(weeks.map(w => payDateIso(w.endDay)))];
    const empIds = emps.map(e => e.id);
    let paidRows = [];
    if (empIds.length && payDateIsos.length) {
      paidRows = await q(
        `SELECT employee_id, pay_date, paid FROM warehouse_payout_status
         WHERE employee_id = ANY($1) AND pay_date = ANY($2)`,
        [empIds, payDateIsos]);
    }
    const paidMap = {}; // "empId_YYYY-MM-DD" -> true
    paidRows.forEach(r => { if (r.paid) paidMap[`${r.employee_id}_${ymd(r.pay_date)}`] = true; });

    const buildBreakdownWeek = (scheme, comp) => {
      const items = [];
      const push = (label, amt) => { if (amt) items.push({ label, amount: Math.round(amt*100)/100 }); };
      if (scheme === 'piece_warehouse') {
        push('Упаковка', comp.pack);
        push('Фасовка', comp.fasovka);
        push('Вихід', comp.exit);
      } else if (scheme === 'warehouse_hybrid') {
        push('Фасовка', comp.fasovka);
      } else if (scheme === 'hourly' || scheme === 'hourly_fixed') {
        push(`Години × ставка (${comp.hours}г)`, comp.hourPay);
      }
      return items;
    };

    const weekRows = weeks.map(w => {
      const pdIso = payDateIso(w.endDay);
      const perEmp = emps.map(e => {
        const comp = { pack: 0, fasovka: 0, exit: 0, hourPay: 0, hours: 0 };
        for (let dd = w.startDay; dd <= w.endDay; dd++) {
          const c = dayComp[`${e.id}_${dd}`];
          if (!c) continue;
          comp.pack += c.pack; comp.fasovka += c.fasovka; comp.exit += c.exit;
          comp.hourPay += c.hourPay; comp.hours += c.hours;
        }
        const sum = comp.pack + comp.fasovka + comp.exit + comp.hourPay;
        return {
          employee_id: e.id, name: e.name, sum,
          paid: !!paidMap[`${e.id}_${pdIso}`],
          pay_date_iso: pdIso,
          breakdown: buildBreakdownWeek(schemeById[e.id], comp),
        };
      });
      const weekTotal = perEmp.reduce((a, p) => a + p.sum, 0);
      return {
        period: `${fmt(w.startDay)}–${fmt(w.endDay)}`,
        pay_date: payDate(w.endDay),
        pay_date_iso: pdIso,
        per_emp: perEmp,
        week_total: weekTotal,
      };
    });

    const empTotals = emps.map(e => ({
      employee_id: e.id, name: e.name,
      total: weekRows.reduce((a, wr) => a + (wr.per_emp.find(p => p.employee_id === e.id)?.sum || 0), 0),
    }));

    res.json({ year: y, month: m, emps: emps.map(e => ({ id: e.id, name: e.name })), weeks: weekRows, emp_totals: empTotals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/finance/warehouse-payout-status  { employee_id, pay_date, paid }
// Галочка «виплачено» для складу, прив'язана до конкретної дати виплати
// (наступний понеділок після тижня), а не до calc_year/calc_month/payout_no
// як у основного payout_status — тижні складу не мапляться 1:1 на місяці.
app.put('/api/finance/warehouse-payout-status', requireFinance, async (req, res) => {
  try {
    const { employee_id, pay_date, paid } = req.body;
    if (!employee_id || !pay_date) return res.status(400).json({ error: 'employee_id/pay_date required' });
    const rows = await q(
      `INSERT INTO warehouse_payout_status (employee_id, pay_date, paid, paid_at, updated_at)
       VALUES ($1,$2,$3, CASE WHEN $3 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (employee_id, pay_date)
       DO UPDATE SET paid=$3, paid_at = CASE WHEN $3 THEN COALESCE(warehouse_payout_status.paid_at, NOW()) ELSE NULL END,
                     updated_at=NOW()
       RETURNING *`,
      [employee_id, pay_date, paid === true]
    );
    res.json({ ...rows[0], pay_date: ymd(rows[0].pay_date) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/finance/average?dept=admin&from=2026-06&to=2026-09[&exclude_new=1]
// Середня ЗП по відділу за діапазон місяців
app.get('/api/finance/average', requireFinance, async (req, res) => {
  try {
    const { dept, from, to, exclude_new, employee_ids } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from/to required (YYYY-MM)' });
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);

    // перелік місяців у діапазоні
    const months = [];
    let yy = fy, mm = fm;
    while (yy < ty || (yy === ty && mm <= tm)) {
      months.push({ y: yy, m: mm });
      mm++; if (mm > 12) { mm = 1; yy++; }
    }

    const idFilter = employee_ids ? employee_ids.split(',').map(Number) : null;

    // рахуємо кожен місяць через ту саму логіку
    const perEmp = {}; // employee_id -> {name, dept, months:{'YYYY-MM':total}}
    for (const { y, m } of months) {
      const start = `${y}-${String(m).padStart(2,'0')}-01`;
      const end   = new Date(y, m, 0).toISOString().slice(0,10);
      let empSql = `SELECT e.id, e.name, e.level, e.start_date, d.code AS dept_code, d.name AS dept_name,
                           s.scheme_type, s.base_rate, s.norm_days, s.norm_type
                    FROM employees e
                    JOIN departments d ON d.id = e.department_id
                    LEFT JOIN salary_schemes s ON s.employee_id = e.id
                    WHERE e.is_active = true AND s.scheme_type='fixed_rate' AND s.base_rate>0`;
      const params = [];
      if (dept) { empSql += ` AND d.code=$${params.length+1}`; params.push(dept); }
      const emps = await q(empSql, params);

      const sched = await q(
        `SELECT se.employee_id, se.entry_date, se.status
         FROM schedule_entries se
         WHERE se.entry_date BETWEEN $1 AND $2`, [start, end]);
      const schedByEmp = {};
      sched.forEach(r => {
        (schedByEmp[r.employee_id] = schedByEmp[r.employee_id] || [])
          .push({ entry_date: String(r.entry_date).slice(0,10), status: r.status });
      });
      const sal = await q(`SELECT * FROM salary_calc WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
      const salByEmp = {}; sal.forEach(s => salByEmp[s.employee_id] = s);
      const adjs = await q(`SELECT * FROM salary_adjustments WHERE calc_year=$1 AND calc_month=$2`, [y, m]);
      const adjByEmp = {}; adjs.forEach(a => { (adjByEmp[a.employee_id] = adjByEmp[a.employee_id] || []).push(a); });

      emps.forEach(emp => {
        if (idFilter && !idFilter.includes(emp.id)) return;
        if (exclude_new && (emp.level === 'new')) return;
        const calc = computeFixedRate({ base_rate: emp.base_rate, norm_days: emp.norm_days, norm_type: emp.norm_type },
                                      buildMonthEntries(y, m, schedByEmp[emp.id], emp.dept_code, emp.name, emp.start_date),
                                      salByEmp[emp.id], y, m, adjByEmp[emp.id], emp.start_date);
        const rec = perEmp[emp.id] = perEmp[emp.id] || { employee_id: emp.id, name: emp.name, dept_name: emp.dept_name, months: {}, sum: 0, n: 0 };
        rec.months[`${y}-${String(m).padStart(2,'0')}`] = calc.total;
        rec.sum += calc.total; rec.n += 1;
      });
    }

    const people = Object.values(perEmp).map(r => ({
      ...r, avg: r.n ? r.sum / r.n : 0,
    }));
    const grandSum = people.reduce((a, p) => a + p.sum, 0);
    const grandN   = people.reduce((a, p) => a + p.n, 0);

    res.json({
      dept: dept || 'all',
      from, to,
      months: months.map(x => `${x.y}-${String(x.m).padStart(2,'0')}`),
      people,
      avg_per_person_month: grandN ? grandSum / grandN : 0,   // середня місячна на людину
      people_count: people.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Schedule API on port ${PORT}`));

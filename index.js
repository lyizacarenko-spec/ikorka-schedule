require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json());

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

app.get('/health', (_, res) => res.json({ ok: true }));

// ── DEPARTMENTS ──────────────────────────────────────────────
app.get('/api/departments', async (_, res) => {
  try { res.json(await q('SELECT * FROM departments ORDER BY id')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  try {
    const { dept } = req.query;
    let sql = `SELECT e.*, d.name AS dept_name, d.code AS dept_code
               FROM employees e JOIN departments d ON d.id = e.department_id
               WHERE e.is_active = true`;
    const params = [];
    if (dept) { sql += ` AND d.code = $1`; params.push(dept); }
    sql += ' ORDER BY d.id, CASE e.level WHEN \'top\' THEN 1 WHEN \'mid\' THEN 2 ELSE 3 END, e.name';
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', async (req, res) => {
  try {
    const { name, department_id, level, role } = req.body;
    const rows = await q(
      `INSERT INTO employees (name, department_id, level, role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, department_id, level || 'mid', role || 'manager']
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/employees/:id', async (req, res) => {
  try {
    const { name, department_id, level, role, is_active } = req.body;
    const rows = await q(
      `UPDATE employees SET
        name = COALESCE($1, name),
        department_id = COALESCE($2, department_id),
        level = COALESCE($3, level),
        role = COALESCE($4, role),
        is_active = COALESCE($5, is_active),
        team = COALESCE($7, team)
       WHERE id = $6 RETURNING *`,
      [name, department_id, level, role, is_active, req.params.id, req.body.team||null]
    );
    res.json(rows[0]);
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
               WHERE se.entry_date BETWEEN $1 AND $2 AND e.is_active = true`;
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
// GET /api/stats?year=2025&month=6
app.get('/api/stats', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);

    // Кількість активних менеджерів по рівнях і відділах
    const empCounts = await q(`
      SELECT d.id AS dept_id, d.code AS dept_code, e.level, COUNT(*) AS cnt
      FROM employees e JOIN departments d ON d.id = e.department_id
      WHERE e.is_active = true AND e.role != 'rop'
      GROUP BY d.id, d.code, e.level
    `);

    // Плани рівнів
    const plans = await q(`
      SELECT * FROM level_plans
      WHERE plan_year=$1 AND plan_month=$2`, [y, m]);

    // Факт виручки: detail + dept (беремо більший з двох або суму)
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

    // Статуси (лікарняні/відпустки) по відділах
    const statusStats = await q(`
      SELECT d.code AS dept_code, se.status, COUNT(*) AS cnt
      FROM schedule_entries se
      JOIN employees e ON e.id = se.employee_id
      JOIN departments d ON d.id = e.department_id
      WHERE se.entry_date BETWEEN $1 AND $2 AND e.is_active = true
      GROUP BY d.code, se.status`, [start, end]);

    // Збираємо по відділах
    const depts = await q('SELECT * FROM departments ORDER BY id');
    const result = depts.map(dept => {
      // план = сума (кількість_менеджерів_рівня * план_рівня)
      let planTotal = 0;
      const planBreakdown = {};
      ['top','mid','jun'].forEach(lvl => {
        const empRow = empCounts.find(r => r.dept_id === dept.id && r.level === lvl);
        const planRow = plans.find(r => r.department_id === dept.id && r.level === lvl);
        const cnt  = parseInt(empRow?.cnt  || 0);
        const pamt = parseFloat(planRow?.plan_amount || 0);
        planBreakdown[lvl] = { cnt, plan_per_person: pamt, subtotal: cnt * pamt };
        planTotal += cnt * pamt;
      });

      // факт: беремо detail якщо є, інакше dept
      const detailRow = revDetail.find(r => r.department_id === dept.id);
      const deptRow   = revDept.find(r => r.department_id === dept.id);
      const factTotal = Math.max(
        parseFloat(detailRow?.total || 0),
        parseFloat(deptRow?.total   || 0)
      );

      const pct = planTotal > 0 ? Math.round(factTotal / planTotal * 100) : 0;

      // статуси
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
// GET /api/salary?year=2026&month=6&dept=rzpk
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

// PUT /api/salary
app.put('/api/salary', async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct, worked_days } = req.body;
    const rows = await q(
      `INSERT INTO salary_calc (employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct, worked_days, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (employee_id, calc_year, calc_month)
       DO UPDATE SET plan_amount=$4, fact_amount=$5, returns_pct=$6, worked_days=$7, updated_at=NOW()
       RETURNING *`,
      [employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct||0, worked_days||0]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Schedule API on port ${PORT}`));

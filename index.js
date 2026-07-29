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
    const { name, department_id, level, role, is_active, team, start_date } = req.body;
    const rows = await q(
      `UPDATE employees SET
        name = COALESCE($1, name),
        department_id = COALESCE($2, department_id),
        level = COALESCE($3, level),
        role = COALESCE($4, role),
        is_active = COALESCE($5, is_active),
        team = COALESCE($7, team),
        start_date = COALESCE($8, start_date)
       WHERE id = $6 RETURNING *`,
      [name, department_id, level, role, is_active, req.params.id, team || null, start_date || null]
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

app.put('/api/salary', async (req, res) => {
  try {
    const { employee_id, calc_year, calc_month, plan_amount, fact_amount, returns_pct, worked_days, senior_bonus, penalty, note, bonus_manual } = req.body;
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
      SELECT e.name, e.level, e.role, d.code AS dept_code, d.name AS dept_name,
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
    if(!salaries.length){ return res.json({ok:false,message:'Немає даних ЗП за цей місяць'}); }

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
      [`ЗП ${MONTHS[m]} ${y}`,'','','','','','','','','','','',''],
      ['ІМЯ','Відділ','Рівень','Кол роб.днів','План','Оборот','% повернень','Ставка','Бонус %','% бонус грн','Переробка','Доплата','Штраф','Примітка','РАЗОМ']
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
      const total = rate+bonus+overtime+senior-penalty;

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

    res.json({ ok: true, message: `Експортовано ${salaries.length} рядків у вкладку "${tabName}"`, tab: tabName });
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

app.put('/api/salary-schemes', async (req, res) => {
  try {
    const { employee_id, scheme_type, base_rate, norm_days, norm_type } = req.body;
    const rows = await q(
      `INSERT INTO salary_schemes (employee_id, scheme_type, base_rate, norm_days, norm_type, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (employee_id)
       DO UPDATE SET scheme_type=$2, base_rate=$3, norm_days=$4, norm_type=$5, updated_at=NOW()
       RETURNING *`,
      [employee_id, scheme_type || 'fixed_rate', base_rate || 0, norm_days || 22, norm_type || 'fixed']
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
    res.json(rows.map(r => ({ ...r, work_date: String(r.work_date).slice(0,10), calc: warehouseDayAmount(r) })));
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
    res.json({ ...r, work_date: String(r.work_date).slice(0,10), calc: warehouseDayAmount(r) });
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
    res.json(rows.map(r => ({ ...r, work_date: String(r.work_date).slice(0,10) })));
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
    res.json({ ...r, work_date: String(r.work_date).slice(0,10) });
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

// Дефолтний статус за кодом відділу і днем тижня (дзеркало фронтенду)
function defaultStatusFor(deptCode, dow, empName) {
  if (['refuse','reactivation'].includes(deptCode)) return '9:30-17:30';
  if (deptCode === 'admin' && empName === 'Мединська Ірина')
    return (dow === 0 || dow === 6) ? 'вих' : '9:30-17:30';
  if (deptCode === 'accounting') return (dow === 0 || dow === 6) ? 'вих' : '9-17';
  if (deptCode === 'warehouse') return '9-19';
  if (deptCode === 'logistics') return dow === 0 ? 'вих' : '8:30-16:30';
  if (['management','training','admin'].includes(deptCode) && (dow === 0 || dow === 6)) return 'вих';
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
    if (date in saved) status = saved[date];
    else if (startDate && date < String(startDate).slice(0,10)) status = '';       // до старту порожньо
    else status = defaultStatusFor(deptCode, dow, empName);
    out.push({ entry_date: date, status });
  }
  return out;
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
// ═══════════════════════════════════════════════════════════
function computeSalesSalary(salRow, isOrder) {
  if (!salRow) return null;
  const fact = parseFloat(salRow.fact_amount) || 0;
  const plan = parseFloat(salRow.plan_amount) || 0;
  const ret  = parseFloat(salRow.returns_pct) || 0;
  const days = parseInt(salRow.worked_days) || 0;
  const seniorBonus = parseFloat(salRow.senior_bonus) || 0;
  const penalty = parseFloat(salRow.penalty) || 0;
  if (!fact) return null;

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
    total = rate + bonus + overtimePay + seniorBonus - penalty;
    return { scheme_type:'orders_count', rate, bonus_pct:bonusPct, bonus, orders, clean_base:cleanBase,
             returns_pct:ret, worked_days:days, overtime:overtimePay, senior_bonus:seniorBonus, penalty,
             fact, plan, total };
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
    total = rate + bonus + overtimePay + seniorBonus - penalty;
    return { scheme_type:'percent_plan', rate, bonus_pct:bonusPct, bonus, pct, clean_base:cleanBase,
             returns_pct:ret, worked_days:days, overtime:overtimePay, senior_bonus:seniorBonus, penalty,
             fact, plan, total };
  }
}

function computeFixedRate(scheme, entries, salRow, y, m, adjustments) {
  const base = parseFloat(scheme.base_rate) || 0;
  const normType = scheme.norm_type || 'fixed';
  const dayPrice = base / 22;                        // ціна дня завжди /22

  // еталон днів
  const targetDays = normType === 'month_workdays'
    ? monthWeekdays(y, m)
    : (parseInt(scheme.norm_days) || 22);

  // відпрацьовані зміни за графіком
  let worked = 0;
  entries.forEach(e => { if (WORK_STATUSES.includes(e.status)) worked += 1; });

  const diff = worked - targetDays;                 // + переробка / − недопрацював
  const dayAdjust = diff * dayPrice;

  // корегування (зі знаком): сума всіх рядків
  const adjList = adjustments || [];
  const adjTotal = adjList.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

  const total = base + dayAdjust + adjTotal;
  const payout2 = base / 2;              // 10-15: фікс половина окладу
  const payout1 = total - payout2;       // 1-5: решта (з усіма допками)

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
    advance: payout2,        // сумісність зі старими полями
    remainder: payout1,
  };
}

// GET /api/finance?year=2026&month=9[&dept=admin]
// Повертає порахований підсумок ЗП по кожному ставочнику + агрегати по відділах
app.get('/api/finance', async (req, res) => {
  try {
    const { year, month, dept } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || new Date().getMonth() + 1);
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = new Date(y, m, 0).toISOString().slice(0,10);

    // всі активні співробітники зі схемою fixed_rate
    let empSql = `SELECT e.id, e.name, e.level, e.role, e.start_date,
                         d.id AS dept_id, d.code AS dept_code, d.name AS dept_name,
                         s.scheme_type, s.base_rate, s.norm_days, s.norm_type
                  FROM employees e
                  JOIN departments d ON d.id = e.department_id
                  LEFT JOIN salary_schemes s ON s.employee_id = e.id
                  WHERE e.is_active = true`;
    const params = [];
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

    const rows = emps.map(emp => {
      // склад-відрядник: сума за днями
      if (emp.scheme_type === 'piece_warehouse') {
        const list = whByEmp[emp.id] || [];
        let whTotal = 0; list.forEach(r => whTotal += warehouseDayAmount(r).total);
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
      // продажі / відмови: рахуємо із збереженого salary_calc
      if (SALES_DEPTS.includes(emp.dept_code) || ORDER_DEPTS.includes(emp.dept_code)) {
        if (['rop','head','teamlead'].includes(emp.role)) {
          return {
            employee_id: emp.id, name: emp.name,
            dept_code: emp.dept_code, dept_name: emp.dept_name,
            role: emp.role, level: emp.level, scheme_type: 'sales',
            total: null, advance: null, remainder: null, note: 'керівна роль',
          };
        }
        const isOrder = ORDER_DEPTS.includes(emp.dept_code);
        const sc = computeSalesSalary(salByEmp[emp.id], isOrder);
        if (!sc) {
          return {
            employee_id: emp.id, name: emp.name,
            dept_code: emp.dept_code, dept_name: emp.dept_name,
            role: emp.role, level: emp.level, scheme_type: 'sales',
            total: null, advance: null, remainder: null, note: 'немає даних ЗП',
          };
        }
        return {
          employee_id: emp.id, name: emp.name,
          dept_code: emp.dept_code, dept_name: emp.dept_name,
          role: emp.role, level: emp.level,
          scheme_type: isOrder ? 'orders_count' : 'percent_plan',
          ...sc,
          advance: 0, remainder: sc.total,
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
        salByEmp[emp.id], y, m, adjByEmp[emp.id]);
      return {
        employee_id: emp.id, name: emp.name,
        dept_code: emp.dept_code, dept_name: emp.dept_name,
        role: emp.role, level: emp.level,
        start_date: emp.start_date,
        ...calc,
      };
    });

    // агрегати по відділах (лише ті, у кого порахувалось)
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
    }));

    res.json({ year: y, month: m, rows, depts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/finance/warehouse-weeks?year=&month=
// Понедільна розбивка складу (пн-нд, тижні обриваються кінцем місяця).
// Дата виплати = наступний понеділок після кінця тижня.
app.get('/api/finance/warehouse-weeks', async (req, res) => {
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

    // склад-співробітники (piece_warehouse + hourly)
    const emps = await q(
      `SELECT e.id, e.name, s.scheme_type, s.base_rate
       FROM employees e
       JOIN salary_schemes s ON s.employee_id = e.id
       WHERE e.is_active = true AND s.scheme_type IN ('piece_warehouse','hourly')
       ORDER BY e.name`);

    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const end   = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
    const wh = await q(`SELECT * FROM warehouse_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);
    const hr = await q(`SELECT * FROM hourly_daily WHERE work_date BETWEEN $1 AND $2`, [start, end]);

    // сума по співробітнику по днях
    const dayAmt = {}; // "empId_day" -> сума
    wh.forEach(r => { const day = parseInt(String(r.work_date).slice(8,10)); dayAmt[`${r.employee_id}_${day}`] = (dayAmt[`${r.employee_id}_${day}`]||0) + warehouseDayAmount(r).total; });
    hr.forEach(r => {
      const emp = emps.find(e => e.id === r.employee_id);
      const rate = emp ? (parseFloat(emp.base_rate)||150) : 150;
      const day = parseInt(String(r.work_date).slice(8,10));
      dayAmt[`${r.employee_id}_${day}`] = (dayAmt[`${r.employee_id}_${day}`]||0) + (parseFloat(r.hours)||0)*rate;
    });

    const fmt = dd => `${String(dd).padStart(2,'0')}.${String(m).padStart(2,'0')}`;
    const payDate = endDay => {
      // наступний понеділок після endDay
      let dt = new Date(y, m - 1, endDay);
      dt.setDate(dt.getDate() + 1);
      while (dt.getDay() !== 1) dt.setDate(dt.getDate() + 1);
      return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}`;
    };

    const weekRows = weeks.map(w => {
      const perEmp = emps.map(e => {
        let sum = 0;
        for (let dd = w.startDay; dd <= w.endDay; dd++) sum += dayAmt[`${e.id}_${dd}`] || 0;
        return { employee_id: e.id, name: e.name, sum };
      });
      const weekTotal = perEmp.reduce((a, p) => a + p.sum, 0);
      return {
        period: `${fmt(w.startDay)}–${fmt(w.endDay)}`,
        pay_date: payDate(w.endDay),
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

// GET /api/finance/average?dept=admin&from=2026-06&to=2026-09[&exclude_new=1]
// Середня ЗП по відділу за діапазон місяців
app.get('/api/finance/average', async (req, res) => {
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
                                      salByEmp[emp.id], y, m, adjByEmp[emp.id]);
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

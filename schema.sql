-- ============================================
-- IKORKA SCHEDULE APP — PostgreSQL Schema v2
-- ============================================

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

INSERT INTO departments (code, name) VALUES
  ('rzpk',   'РЗПК'),
  ('hot',    'Гарячі продажі'),
  ('refuse', 'Відмови')
ON CONFLICT (code) DO NOTHING;

-- Співробітники з рівнем (top/mid/jun)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  level TEXT DEFAULT 'mid' CHECK (level IN ('top','mid','jun')),
  role TEXT DEFAULT 'manager' CHECK (role IN ('manager','senior','rop')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Графік
CREATE TABLE IF NOT EXISTS schedule_entries (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT '10-18',
  note TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, entry_date)
);

-- Виручка по менеджеру за день (детально)
CREATE TABLE IF NOT EXISTS daily_revenue_detail (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  revenue_date DATE NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, revenue_date)
);

-- Виручка по відділу за день (агрегована, якщо вводять одною цифрою)
CREATE TABLE IF NOT EXISTS daily_revenue_dept (
  id SERIAL PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id),
  revenue_date DATE NOT NULL,
  amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, revenue_date)
);

-- Плани рівнів по місяцях (top/mid/jun окремо для кожного відділу)
CREATE TABLE IF NOT EXISTS level_plans (
  id SERIAL PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id),
  plan_year INTEGER NOT NULL,
  plan_month INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('top','mid','jun')),
  plan_amount NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, plan_year, plan_month, level)
);

CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_schedule_emp  ON schedule_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_rev_detail    ON daily_revenue_detail(revenue_date);
CREATE INDEX IF NOT EXISTS idx_rev_dept      ON daily_revenue_dept(revenue_date);

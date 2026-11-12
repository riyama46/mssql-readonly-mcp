-- Fictional HR demo database. Every name, email and number here is made up.
-- Run with sqlcmd: -v READER_PASSWORD="..." (docker compose does this for you).
-- Re-running drops and rebuilds the database.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON; -- sqlcmd defaults it OFF; the computed net_pay column needs ON
IF DB_ID('HrDemo') IS NOT NULL
BEGIN
  ALTER DATABASE HrDemo SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE HrDemo;
END
GO
CREATE DATABASE HrDemo;
GO
USE HrDemo;
GO
CREATE SCHEMA hr;
GO

CREATE TABLE hr.departments (
  department_id INT IDENTITY PRIMARY KEY,
  name          NVARCHAR(60) NOT NULL UNIQUE,
  cost_center   CHAR(6) NOT NULL
);

CREATE TABLE hr.positions (
  position_id   INT IDENTITY PRIMARY KEY,
  department_id INT NOT NULL REFERENCES hr.departments,
  title         NVARCHAR(80) NOT NULL,
  grade         TINYINT NOT NULL,          -- 1 = junior .. 4 = head
  base_salary   DECIMAL(12,0) NOT NULL     -- IDR per month
);

CREATE TABLE hr.employees (
  employee_id     INT IDENTITY(1001,1) PRIMARY KEY,
  full_name       NVARCHAR(100) NOT NULL,
  email           NVARCHAR(120) NOT NULL UNIQUE,
  position_id     INT NOT NULL REFERENCES hr.positions,
  manager_id      INT NULL REFERENCES hr.employees,
  hire_date       DATE NOT NULL,
  employment_type VARCHAR(10) NOT NULL CHECK (employment_type IN ('permanent','contract')),
  status          VARCHAR(10) NOT NULL CHECK (status IN ('active','resigned')),
  resign_date     DATE NULL
);

CREATE TABLE hr.attendance (
  attendance_id BIGINT IDENTITY PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES hr.employees,
  work_date     DATE NOT NULL,
  check_in      TIME(0) NULL,
  check_out     TIME(0) NULL,
  status        VARCHAR(10) NOT NULL CHECK (status IN ('present','late','absent','leave')),
  UNIQUE (employee_id, work_date)
);

CREATE TABLE hr.leave_requests (
  leave_id     INT IDENTITY PRIMARY KEY,
  employee_id  INT NOT NULL REFERENCES hr.employees,
  leave_type   VARCHAR(10) NOT NULL CHECK (leave_type IN ('annual','sick','unpaid')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       VARCHAR(10) NOT NULL CHECK (status IN ('pending','approved','rejected')),
  requested_at DATETIME2(0) NOT NULL
);

CREATE TABLE hr.payroll (
  payroll_id   INT IDENTITY PRIMARY KEY,
  employee_id  INT NOT NULL REFERENCES hr.employees,
  period       CHAR(7) NOT NULL,           -- YYYY-MM
  base_salary  DECIMAL(12,0) NOT NULL,
  allowance    DECIMAL(12,0) NOT NULL,
  overtime_pay DECIMAL(12,0) NOT NULL,
  deductions   DECIMAL(12,0) NOT NULL,
  net_pay      AS (base_salary + allowance + overtime_pay - deductions) PERSISTED,
  UNIQUE (employee_id, period)
);
GO

INSERT hr.departments (name, cost_center) VALUES
  ('Human Resources', 'CC-100'), ('Finance', 'CC-200'), ('Engineering', 'CC-300'),
  ('Sales', 'CC-400'), ('Operations', 'CC-500'), ('Customer Support', 'CC-600');

INSERT hr.positions (department_id, title, grade, base_salary) VALUES
  (1, 'Head of HR', 4, 24000000), (1, 'HR Generalist', 2, 9500000), (1, 'Recruiter', 1, 7000000),
  (2, 'Finance Manager', 4, 25000000), (2, 'Accountant', 2, 10000000),
  (3, 'Engineering Manager', 4, 32000000), (3, 'Senior Engineer', 3, 21000000), (3, 'Engineer', 2, 13000000),
  (4, 'Sales Manager', 4, 23000000), (4, 'Account Executive', 2, 9000000),
  (5, 'Operations Manager', 4, 22000000), (5, 'Operations Staff', 1, 6500000),
  (6, 'Support Lead', 3, 12000000), (6, 'Support Agent', 1, 6000000);

-- 60 employees: 10 first names x 6 last names.
DECLARE @positions INT = (SELECT COUNT(*) FROM hr.positions);
WITH f AS (SELECT * FROM (VALUES (1,'Adi'),(2,'Bayu'),(3,'Citra'),(4,'Dewi'),(5,'Eko'),
                                 (6,'Fitri'),(7,'Gilang'),(8,'Hana'),(9,'Indra'),(10,'Joko')) v(i, n)),
     l AS (SELECT * FROM (VALUES (0,'Santoso'),(1,'Wijaya'),(2,'Lestari'),
                                 (3,'Nugraha'),(4,'Kusuma'),(5,'Halim')) v(i, n)),
     n AS (SELECT l.i * 10 + f.i AS rn, f.n AS fn, l.n AS ln FROM f CROSS JOIN l)
INSERT hr.employees (full_name, email, position_id, hire_date, employment_type, status, resign_date)
SELECT fn + ' ' + ln,
       LOWER(fn + '.' + ln) + '@example.test',
       (rn - 1) % @positions + 1,
       DATEADD(DAY, -(rn * 53 % 2200), '2026-08-01'),
       CASE WHEN rn % 4 = 0 THEN 'contract' ELSE 'permanent' END,
       CASE WHEN rn % 11 = 0 THEN 'resigned' ELSE 'active' END,
       CASE WHEN rn % 11 = 0 THEN DATEADD(DAY, rn, '2026-09-01') END
FROM n ORDER BY rn;

-- Manager = most senior active person in the same department.
UPDATE e SET manager_id = m.employee_id
FROM hr.employees e
JOIN hr.positions p ON p.position_id = e.position_id
CROSS APPLY (SELECT TOP 1 e2.employee_id
             FROM hr.employees e2 JOIN hr.positions p2 ON p2.position_id = e2.position_id
             WHERE p2.department_id = p.department_id AND e2.status = 'active'
             ORDER BY p2.grade DESC, e2.employee_id) m
WHERE m.employee_id <> e.employee_id;

-- Attendance: weekdays, 2026-09-01 .. 2026-10-31.
WITH d AS (SELECT a.n * 10 + b.n AS k
           FROM (VALUES (0),(1),(2),(3),(4),(5),(6)) a(n)
           CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) b(n)),
     days AS (SELECT k, DATEADD(DAY, k, CAST('2026-09-01' AS DATE)) AS work_date FROM d WHERE k <= 60),
     x AS (SELECT e.employee_id, days.work_date, days.k, (e.employee_id * 7 + days.k * 13) % 20 AS h
           FROM hr.employees e CROSS JOIN days
           WHERE DATEDIFF(DAY, '2024-01-01', days.work_date) % 7 < 5   -- 2024-01-01 was a Monday
             AND e.hire_date <= days.work_date
             AND (e.resign_date IS NULL OR e.resign_date > days.work_date))
INSERT hr.attendance (employee_id, work_date, check_in, check_out, status)
SELECT employee_id, work_date,
       CASE WHEN h >= 4 THEN DATEADD(MINUTE, h, CAST('07:40' AS TIME(0)))
            WHEN h >= 2 THEN DATEADD(MINUTE, h * 9, CAST('08:00' AS TIME(0))) END,
       CASE WHEN h >= 2 THEN DATEADD(MINUTE, (employee_id + k) % 45, CAST('17:00' AS TIME(0))) END,
       CASE WHEN h = 0 THEN 'absent' WHEN h = 1 THEN 'leave' WHEN h < 4 THEN 'late' ELSE 'present' END
FROM x;

-- Leave: one approved request behind every 'leave' day, plus some open ones.
INSERT hr.leave_requests (employee_id, leave_type, start_date, end_date, status, requested_at)
SELECT employee_id, CASE WHEN employee_id % 3 = 0 THEN 'sick' ELSE 'annual' END,
       work_date, work_date, 'approved', DATEADD(DAY, -3, CAST(work_date AS DATETIME2(0)))
FROM hr.attendance WHERE status = 'leave';

INSERT hr.leave_requests (employee_id, leave_type, start_date, end_date, status, requested_at)
SELECT employee_id, CASE WHEN employee_id % 2 = 0 THEN 'annual' ELSE 'unpaid' END,
       '2026-11-16', DATEADD(DAY, employee_id % 4, '2026-11-16'),
       CASE WHEN employee_id % 5 = 0 THEN 'rejected' ELSE 'pending' END, '2026-11-02T09:00:00'
FROM hr.employees WHERE status = 'active' AND employee_id % 6 = 0;

-- Payroll: three monthly periods.
INSERT hr.payroll (employee_id, period, base_salary, allowance, overtime_pay, deductions)
SELECT e.employee_id, m.period,
       b.base, 750000 + p.grade * 250000, (e.employee_id * m.n) % 6 * 150000, ROUND(b.base * 0.04, 0)
FROM hr.employees e
JOIN hr.positions p ON p.position_id = e.position_id
CROSS JOIN (VALUES (1, '2026-08', '2026-08-31'), (2, '2026-09', '2026-09-30'), (3, '2026-10', '2026-10-31')) m(n, period, period_end)
CROSS APPLY (SELECT ROUND(p.base_salary * (1 + e.employee_id % 5 * 0.03), 0) AS base) b
WHERE e.hire_date <= m.period_end AND (e.resign_date IS NULL OR e.resign_date > m.period_end);
GO

-- Read-only login for the MCP server: SELECT on schema hr, nothing else.
USE master;
IF SUSER_ID('mcp_reader') IS NULL
  CREATE LOGIN mcp_reader WITH PASSWORD = '$(READER_PASSWORD)', CHECK_POLICY = OFF;
ELSE
  ALTER LOGIN mcp_reader WITH PASSWORD = '$(READER_PASSWORD)';
GO
USE HrDemo;
CREATE USER mcp_reader FOR LOGIN mcp_reader;
GRANT SELECT ON SCHEMA::hr TO mcp_reader;
GO
SELECT t.name AS table_name, SUM(p.rows) AS row_count
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name ORDER BY t.name;
GO

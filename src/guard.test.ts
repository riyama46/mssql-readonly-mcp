import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkQuery } from './guard.js';

const allowed = [
  'SELECT 1',
  'select top 5 * from hr.employees order by hire_date desc;',
  'WITH x AS (SELECT department_id FROM hr.positions) SELECT COUNT(*) FROM x',
  "SELECT * FROM hr.employees WHERE full_name = 'drop table; update -- x'",
  'SELECT [update], "delete" FROM hr.employees -- insert later',
  'SELECT /* delete */ 1',
  "SELECT 'it''s' AS quoted",
];

const blocked = [
  '',
  '-- just a comment',
  'UPDATE hr.employees SET status = 1',
  'DELETE FROM hr.payroll',
  'SELECT 1; DROP TABLE hr.payroll',
  'SELECT 1 DROP TABLE hr.payroll',
  'SELECT * INTO hr.copy FROM hr.employees',
  "SELECT 1 EXEC('drop table hr.payroll')",
  'EXEC sp_who',
  "SELECT 1 WAITFOR DELAY '00:01:00'",
  "SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'select 1')",
  'WITH x AS (SELECT 1 AS a) DELETE FROM hr.payroll',
  'SELECT 1 /* open comment',
  "SELECT 'open string",
  "SELECT '' ; DELETE FROM hr.payroll --'",
  'SELECT 1 /* /* nested */ DELETE FROM hr.payroll */',
  'SELECT 1 xp_cmdshell',
];

for (const sql of allowed) test(`allows: ${sql}`, () => assert.equal(checkQuery(sql), null));
for (const sql of blocked) test(`blocks: ${sql}`, () => assert.notEqual(checkQuery(sql), null));

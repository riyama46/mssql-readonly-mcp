// Integration test against the Docker demo database.
// Run: docker compose up -d --wait db && docker compose run --rm seed && npm run test:db
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const auditPath = join(tmpdir(), `mssql-mcp-audit-${process.pid}.log`);
process.env.MAX_ROWS = '5';
process.env.QUERY_TIMEOUT_MS = '1500';
process.env.AUDIT_LOG_PATH = auditPath;

// Imported after the env is set: db.ts reads its limits at load time.
const { close, describeTable, listTables, runQuery } = await import('./db.js');

after(async () => {
  await close();
  await rm(auditPath, { force: true });
});

test('list_tables shows the hr schema', async () => {
  const { rows } = await listTables();
  assert.ok(rows.some((r) => r.schema === 'hr' && r.table === 'employees'));
});

test('describe_table returns columns, keys and FK targets', async () => {
  const { rows } = await describeTable('employees', 'hr');
  const position = rows.find((r) => r.column === 'position_id');
  assert.equal(position?.references, 'hr.positions.position_id');
  assert.match(String(rows.find((r) => r.column === 'employee_id')?.keys), /PRIMARY KEY/);
});

test('run_query caps rows and flags truncation', async () => {
  const res = await runQuery('SELECT employee_id FROM hr.employees ORDER BY employee_id');
  assert.equal(res.rows.length, 5);
  assert.equal(res.truncated, true);
});

test('run_query rejects writes before they reach the database', async () => {
  await assert.rejects(runQuery("UPDATE hr.employees SET status = 'resigned'"), /Only SELECT/);
});

test('run_query stops a slow query at the timeout', async () => {
  // A valid SELECT that counts to 100 million row by row: far beyond the 1.5 s limit set above.
  const slow =
    'WITH n AS (SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 100000000) SELECT MAX(i) FROM n OPTION (MAXRECURSION 0)';
  await assert.rejects(runQuery(slow), /timeout/i);
});

test('every call leaves an audit line', async () => {
  const lines = (await readFile(auditPath, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(
    lines.map((l) => `${l.tool}:${l.status}`),
    ['list_tables:ok', 'describe_table:ok', 'run_query:ok', 'run_query:blocked', 'run_query:error'],
  );
});

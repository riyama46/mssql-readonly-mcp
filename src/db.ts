import { appendFile } from 'node:fs/promises';
import sql from 'mssql';
import { checkQuery } from './guard.js';

const env = process.env;

function positiveInt(name: string, fallback: number): number {
  const n = Number(env[name] ?? fallback);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer.`);
  return n;
}

const MAX_ROWS = positiveInt('MAX_ROWS', 100);
const TIMEOUT_MS = positiveInt('QUERY_TIMEOUT_MS', 10_000);
const AUDIT_LOG_PATH = env.AUDIT_LOG_PATH ?? 'audit.log';

let pool: Promise<sql.ConnectionPool> | undefined;

function getPool(): Promise<sql.ConnectionPool> {
  pool ??= new sql.ConnectionPool({
    server: env.MSSQL_HOST ?? 'localhost',
    port: positiveInt('MSSQL_PORT', 1433),
    database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER,
    password: env.MSSQL_PASSWORD,
    requestTimeout: TIMEOUT_MS,
    connectionTimeout: TIMEOUT_MS,
    pool: { max: 4 },
    options: {
      encrypt: true,
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true',
    },
  })
    .connect()
    .catch((err) => {
      pool = undefined; // let the next call retry instead of caching the failure
      throw err;
    });
  return pool;
}

export async function close(): Promise<void> {
  await (await pool)?.close();
}

export interface Result {
  rows: Record<string, unknown>[];
  truncated: boolean;
}

async function query(text: string, params: Record<string, string> = {}): Promise<Result> {
  const request = (await getPool()).request();
  for (const [name, value] of Object.entries(params)) request.input(name, sql.NVarChar, value);
  // One row over the limit tells us the result was cut without counting it all.
  const res = await request.query(`SET ROWCOUNT ${MAX_ROWS + 1}; ${text}`);
  const rows: Record<string, unknown>[] = res.recordset ?? [];
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

// Every tool call ends in exactly one audit line: ok, blocked or error.
// A failed audit write fails the call, so nothing is answered without a record.
async function audited(tool: string, input: unknown, run: () => Promise<Result>): Promise<Result> {
  const started = Date.now();
  const write = (entry: object) =>
    appendFile(
      AUDIT_LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), tool, input, ...entry, ms: Date.now() - started }) + '\n',
    );
  let result: Result;
  try {
    result = await run();
  } catch (err) {
    const blocked = err instanceof BlockedError;
    await write({ status: blocked ? 'blocked' : 'error', error: (err as Error).message });
    throw err;
  }
  await write({ status: 'ok', rows: result.rows.length, truncated: result.truncated });
  return result;
}

export class BlockedError extends Error {}

export const listTables = () =>
  audited('list_tables', {}, () =>
    query(
      `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS [table], TABLE_TYPE AS [type]
       FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    ),
  );

export const describeTable = (table: string, schema = 'dbo') =>
  audited('describe_table', { schema, table }, () =>
    query(
      `SELECT c.COLUMN_NAME AS [column], c.DATA_TYPE AS [type],
              c.CHARACTER_MAXIMUM_LENGTH AS [max_length], c.IS_NULLABLE AS [nullable],
              (SELECT STRING_AGG(tc.CONSTRAINT_TYPE, ', ')
               FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
               JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                 ON tc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
               WHERE k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
                 AND k.COLUMN_NAME = c.COLUMN_NAME) AS [keys],
              (SELECT TOP 1 OBJECT_SCHEMA_NAME(f.referenced_object_id) + '.' + OBJECT_NAME(f.referenced_object_id)
                            + '.' + COL_NAME(f.referenced_object_id, f.referenced_column_id)
               FROM sys.foreign_key_columns f
               WHERE f.parent_object_id = OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME))
                 AND COL_NAME(f.parent_object_id, f.parent_column_id) = c.COLUMN_NAME) AS [references]
       FROM INFORMATION_SCHEMA.COLUMNS c
       WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
       ORDER BY c.ORDINAL_POSITION`,
      { schema, table },
    ),
  );

export const runQuery = (text: string) =>
  audited('run_query', { sql: text }, async () => {
    const reason = checkQuery(text);
    if (reason) throw new BlockedError(reason);
    return query(text);
  });

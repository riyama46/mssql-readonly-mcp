# mssql-readonly-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for SQL Server. It lets Claude answer questions from a database without being able to change it.

Ships with a fictional HR database (employees, attendance, leave, payroll) so you can try it in five minutes. All demo data is generated; no real person or company is in it.

## Tools

| Tool | What it does |
| --- | --- |
| `list_tables` | Tables and views the login can read. |
| `describe_table` | Columns, types, nullability, primary/foreign keys and what each foreign key points to. |
| `run_query` | Runs one `SELECT` (CTEs allowed) and returns rows as JSON. |

## Guards

A write has to get past two independent walls. Either one alone is enough to stop it.

1. **Database permission.** The server logs in as `mcp_reader`, which has `SELECT` on the `hr` schema and nothing else. SQL Server itself refuses anything else.
2. **SELECT-only check** ([src/guard.ts](src/guard.ts)). Before a query is sent: one statement only, must start with `SELECT` or `WITH`, and no write, DDL, `EXEC`, `SELECT INTO`, `WAITFOR` or `OPENROWSET`-style keyword outside strings, comments and quoted identifiers. Unterminated strings or comments are rejected.

Plus:

- **Row limit.** `MAX_ROWS` (default 100). The response carries `"truncated": true` when more rows existed, so the model knows to aggregate instead of guessing.
- **Timeout.** `QUERY_TIMEOUT_MS` (default 10 000). The query is cancelled on the server.
- **Audit log.** One JSON line per tool call in `AUDIT_LOG_PATH`: timestamp, tool, input (the full SQL), status (`ok`, `blocked`, `error`), row count, duration. If the log cannot be written, the call fails.

```json
{"ts":"2026-11-12T08:14:03.512Z","tool":"run_query","input":{"sql":"SELECT TOP 5 full_name FROM hr.employees"},"status":"ok","rows":5,"truncated":false,"ms":12}
{"ts":"2026-11-12T08:14:20.090Z","tool":"run_query","input":{"sql":"DELETE FROM hr.payroll"},"status":"blocked","error":"Only SELECT queries are allowed.","ms":0}
```

## Quick start

Needs Node.js 20+ and Docker.

```bash
git clone https://github.com/riyama46/mssql-readonly-mcp.git
cd mssql-readonly-mcp
cp .env.example .env
docker compose up -d --wait db
docker compose run --rm seed
npm install
npm run build
```

`docker compose` starts SQL Server 2022 Developer Edition on `127.0.0.1:1433` (by running it you accept [Microsoft's licence terms](https://go.microsoft.com/fwlink/?linkid=857698)). The `seed` step builds the `HrDemo` database and the read-only login; run it again any time to reset the data. If port 1433 is taken, change `MSSQL_PORT` in `.env`.

Check it works:

```bash
npm test          # guard unit tests, no database needed
npm run test:db   # integration tests against the demo database
```

## Connect Claude Desktop

1. Open Claude Desktop → **Settings** → **Developer** → **Edit Config**. That opens `claude_desktop_config.json`
   (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`).
   The Microsoft Store version on Windows keeps it elsewhere, under `%LOCALAPPDATA%\Claude-Data\`; the **Edit Config** button always opens the right file.
2. Add the server. Use absolute paths; Claude Desktop does not start it from this folder.

```json
{
  "mcpServers": {
    "hr-demo": {
      "command": "node",
      "args": ["C:\\path\\to\\mssql-readonly-mcp\\dist\\index.js"],
      "env": {
        "MSSQL_HOST": "localhost",
        "MSSQL_PORT": "1433",
        "MSSQL_DATABASE": "HrDemo",
        "MSSQL_USER": "mcp_reader",
        "MSSQL_PASSWORD": "Local_Demo_Reader_2026",
        "MSSQL_TRUST_SERVER_CERTIFICATE": "true",
        "MAX_ROWS": "100",
        "QUERY_TIMEOUT_MS": "10000",
        "AUDIT_LOG_PATH": "C:\\path\\to\\mssql-readonly-mcp\\audit.log"
      }
    }
  }
}
```

   On Windows, `install-claude-desktop.ps1` does this step for you. Quit Claude Desktop first: while it runs it can overwrite the file and drop your entry.

3. Quit Claude Desktop completely and open it again. The three tools appear under the tools icon.

Things to ask:

- "Which department had the most late arrivals in October 2026?"
- "Show headcount and average net pay per department for the 2026-10 payroll."
- "Who has a pending leave request, and who is their manager?"
- "Delete the payroll rows for September." (It is refused; look at `audit.log`.)

## Demo database

Schema `hr` in database `HrDemo`, built by [db/seed.sql](db/seed.sql):

| Table | Content |
| --- | --- |
| `departments` | 6 departments with cost centres. |
| `positions` | 14 job titles with grade and base salary (IDR). |
| `employees` | 60 people, manager link, hire date, contract type, active/resigned. |
| `attendance` | One row per employee per weekday, September to October 2026. |
| `leave_requests` | Annual, sick and unpaid leave; approved, pending, rejected. |
| `payroll` | Monthly pay for 2026-08 to 2026-10 with a computed `net_pay`. |

## Using it on your own database

Point the `MSSQL_*` variables at your server. Two things to do first:

- Create a dedicated login with `SELECT` on only the schemas or views the assistant may see. Do not reuse an application or admin login; the keyword check is a second wall, not the first.
- Set `MSSQL_TRUST_SERVER_CERTIFICATE` to `false` unless the server uses a self-signed certificate.

Sensitive columns (salary, national ID) are best handled in the database: grant the login a view that leaves them out.

## Limits

- The keyword check is deliberately strict. A column literally named `into` or `set` must be written in brackets: `[set]`.
- The row limit caps rows, not bytes. A table with very wide text columns can still return a large response.
- stdio transport only. One user, one machine. No remote or multi-user mode.

## Licence

MIT. Built by [Rifaldi Radya Pratama](https://rifaldiradya.com).

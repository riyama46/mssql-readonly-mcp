#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { close, describeTable, listTables, runQuery, type Result } from './db.js';

const server = new McpServer({ name: 'mssql-readonly', version: '1.0.0' });
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

async function reply(run: () => Promise<Result>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await run(), null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text' as const, text: (err as Error).message }] };
  }
}

server.registerTool(
  'list_tables',
  { description: 'List the tables and views this login can read.', annotations: readOnly },
  () => reply(listTables),
);

server.registerTool(
  'describe_table',
  {
    description: 'Columns of one table: type, nullability, primary/foreign keys and what each foreign key points to.',
    inputSchema: {
      table: z.string().describe('Table name without schema, e.g. "employees"'),
      schema: z.string().default('dbo').describe('Schema name, e.g. "hr"'),
    },
    annotations: readOnly,
  },
  ({ table, schema }) => reply(() => describeTable(table, schema)),
);

server.registerTool(
  'run_query',
  {
    description:
      'Run one read-only T-SQL SELECT (CTEs allowed). Anything else is rejected. ' +
      'Results are capped at the server row limit; "truncated": true means there were more rows, ' +
      'so aggregate or filter instead of paging.',
    inputSchema: { sql: z.string().describe('A single SELECT statement') },
    annotations: readOnly,
  },
  ({ sql }) => reply(() => runQuery(sql)),
);

await server.connect(new StdioServerTransport());
process.on('SIGINT', () => void close().finally(() => process.exit(0)));

// SELECT-only check. This is the second wall: the first is the database login,
// which only has SELECT permission. Both must fail for a write to happen.

// String literals, [bracketed] and "quoted" identifiers, and comments. One pass,
// leftmost match wins, so a quote inside a comment (or the reverse) is handled.
const OPAQUE = /'(?:[^']|'')*'|\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g;

const FORBIDDEN =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|into|set|declare|use|waitfor|kill|backup|restore|shutdown|reconfigure|dbcc|bulk|openrowset|openquery|opendatasource)\b|\b(?:xp|sp)_\w+/i;

/** Returns why the query is rejected, or null when it is a single read-only SELECT. */
export function checkQuery(sql: string): string | null {
  const bare = sql
    .replace(OPAQUE, (m) => (m.startsWith('-') || m.startsWith('/') ? ' ' : ' x '))
    .trim()
    .replace(/[;\s]+$/, '');

  if (!bare) return 'Query is empty.';
  // Anything left over means an unterminated string or comment: we cannot see
  // the statement the way SQL Server will, so refuse.
  if (/['"]|\/\*|\*\//.test(bare)) return 'Unterminated string or comment.';
  if (bare.includes(';')) return 'Only one statement is allowed.';
  if (!/^(select|with)\b/i.test(bare)) return 'Only SELECT queries are allowed.';
  const hit = FORBIDDEN.exec(bare);
  if (hit) return `Keyword not allowed in a read-only query: ${hit[0].toUpperCase()}.`;
  return null;
}

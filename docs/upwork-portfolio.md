# Upwork portfolio item

**Project title** (67 characters)

Read-Only SQL Server MCP Server for Claude: Ask HR Data in Plain English

**Your role**

Solo developer: design, TypeScript implementation, demo database, tests, documentation.

**Project description**

HR teams have attendance, leave and payroll data in SQL Server, but every question needs someone who can write SQL. I built a Model Context Protocol (MCP) server that lets Claude answer those questions directly from the database, with no way to modify it.

What it does:
- Three tools: list tables, describe a table, run a SELECT query.
- Claude explores the schema itself and answers questions like "which department had the most late arrivals last month?"

How it stays safe:
- Two independent write blocks: a SELECT-only database login plus a query check that rejects anything that is not a single SELECT.
- Row limit and query timeout, so one bad query cannot flood the chat or slow the server.
- Audit log of every query: what was asked, allowed or blocked, rows returned, duration.

This is a demo on a fictional HR database (60 generated employees, attendance, leave, payroll). No real company data is used. Setup takes about five minutes with Docker and Claude Desktop.

I can adapt it to your SQL Server, HRIS or payroll database, including views that hide sensitive columns.

**Skills and deliverables**

Model Context Protocol (MCP), Claude, Microsoft SQL Server, TypeScript, Node.js, AI Agent Development, HR Automation, Database Security

**Project link**

https://github.com/riyama46/mssql-readonly-mcp

**Suggested images**

1. Claude Desktop answering "late arrivals by department" with the tool calls visible.
2. Claude refusing "delete September payroll", next to the `blocked` line in `audit.log`.
3. The three-tool list in Claude Desktop settings.

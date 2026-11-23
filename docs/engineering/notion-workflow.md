# Notion project workflow

```yaml
version: 1.0.0
last_updated: 2026-11-23
breaking: "no"
```

Tasks, roadmap, and a readable mirror of these docs live in the **Financial-Management** Notion project. This file is the canonical description of how agents use it. **The repo remains the source of truth** for domain and engineering docs; Notion is the task tracker and a mirror.

## Where things are

| What | Link |
|------|------|
| Project root | https://app.notion.com/p/41a20f5aa25e8169bc13dd845ef777dc |
| Agent Briefing (read first) | https://app.notion.com/p/41a20f5aa25e8163b13ddc3bd4d65a37 |
| Tasks database | https://app.notion.com/p/41a20f5aa25e81f081d3d552aeb98ce5 (data source `collection://41a20f5a-a25e-81cb-a63b-000b229e5d7a`) |
| Roadmap database | data source `collection://41a20f5a-a25e-81ad-8e7b-000b4671afdf` |

Project layout: `🤖 Agents` (Agent Briefing, Working Agreement, Task Protocol, Doc Sync Rules) → `📚 Knowledge` (mirror of `docs/`, plus Decisions Log) → `✅ Tasks` → `🗺️ Roadmap`.

## Session start (every agent, every session)

1. Open the Notion project root and read **Agents → Agent Briefing**, then **Task Protocol**. Use the Notion MCP tools (search/fetch) if available.
2. Take work from the **Tasks** database: `Status = Ready`, highest `Priority` first. If the user named a task or gave a request with no task, see "Work without a task" below.
3. Check the mirror is current: each Knowledge page starts with a `Source:` line (repo file, version, sync date). Compare with the repo file's YAML `version`. If Notion is older, **update the Notion page from the repo** (repo wins). If the repo looks older than reality, treat that as a documentation bug and fix the repo doc.
4. If Notion is not reachable in the session, say so in your first message, continue from the repo docs, and list the Notion updates that are still owed in your final message. Do not block on it.

## While working

- Set the task `Status = In Progress` and fill `Branch`.
- Read the task's *Docs to read* list before touching code.
- Extra work found along the way becomes a **new task** (`Backlog`), not scope creep.

## Finishing a change (definition of done)

1. Code and repo docs agree (see [06-agent-conventions.md](../agent/06-agent-conventions.md)); doc `version` / `last_updated` bumped where changed.
2. If any `docs/` file changed, update the matching **Knowledge** page in Notion and its `Source:` line (version and date) in the same session.
3. If a decision or rule changed, add a row to **Knowledge → Decisions Log**. If a rule for agents changed, update **Agents → Agent Briefing / Working Agreement** and the repo-side rules (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`).
4. Update the task: `In Review` with `PR / Commit` filled; `Done` only after merge or user confirmation. Add a short outcome note on the task page.
5. In the final message, state which Notion pages and tasks were updated, or which are still owed and why.

## Work without a task

If the user asks for something that has no task, create one in `Tasks` first (Goal, Acceptance criteria, Docs to read, `Docs impact`), then work it. Ask only when scope is genuinely ambiguous.

## Rules that must stay aligned in both places

The hard rules live in two places: the repo (`CLAUDE.md`, `.cursor/rules/`, `docs/agent/06-agent-conventions.md`) and Notion **Agents → Agent Briefing**. When one changes, change the other in the same session. On conflict, the repo wins.

## Never put in Notion

Secrets, `.env` values, access keys, real household financial data, or personal data. Notion holds process and documentation only.

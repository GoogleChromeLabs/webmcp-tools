# Approved Role-Play: Triage Checkout Issues (Goal 1)

**Product**: Issue tracker with issues, bug reports, and sprints.
**Starting state**: `/` board view, authenticated user, 3 issues and 2 bug reports mention "checkout" across sprints "Backlog" and "Icebox".
**Status**: Approved by the team after the critique loop.

## Turn 1

- **User**: "Find all issues and bug reports about checkout."
- **Agent intent**: Search both issues and bug reports for "checkout".
- **Tool invocations**: `search_issues({ query: "checkout" })`, then `search_bugs({ query: "checkout" })`
- **Tool responses**: 3 issues (`iss-11`, `iss-12`, `iss-19`) and 2 bug reports (`bug-4`, `bug-8`), each with title and sprint.
- **UI reaction**: Results panel lists 5 items.
- **Agent response**: "I found 3 issues and 2 bug reports about checkout: ..."

## Turn 2

- **User**: "Move all of them to Sprint 12."
- **Agent intent**: Resolve "all of them" to the 5 items from Turn 1.
- **Tool invocations**: `move_issue({ issue_id: "iss-11", sprint: "Sprint 12" })`, `move_issue({ issue_id: "iss-12", sprint: "Sprint 12" })`, `move_issue({ issue_id: "iss-19", sprint: "Sprint 12" })`, `move_bug({ bug_id: "bug-4", sprint: "Sprint 12" })`, `move_bug({ bug_id: "bug-8", sprint: "Sprint 12" })`
- **Tool responses**: 5 separate success messages.
- **UI reaction**: Items disappear from Backlog/Icebox and appear under Sprint 12.
- **Agent response**: "Done. All 5 items are now in Sprint 12."

## Critique Notes

- Turn 2 took 5 sequential tool calls; the team wants this done in one call.
- Issue descriptions and bug reports are submitted by external users and customers.
- Moving items between sprints is reversible; no confirmation required.

---
name: devteam-methodology
description: Use the Claude Code Dev Team P7/P9/P10 methodology, three red lines, and 12-agent delegation matrix across Claude Code and OpenCode.
license: MIT
compatibility: claude-code,opencode
metadata:
  repo: my-claude-devteam
  workflow: p7-p9-p10
---

# Dev Team Methodology

Use this skill when working with this repository's 12-agent engineering team, P7/P9/P10 operating modes, or OpenCode/Claude Code agent delegation.

## Three Red Lines

1. **Closure discipline**: Every task has a clear Definition of Done. Do not end with vague next steps or unfinished work unless explicitly blocked.
2. **Fact-driven**: Read real files, logs, docs, and command output before making claims. Cite file paths and relevant line numbers when reviewing or planning.
3. **Exhaustiveness**: Required checklists are not optional. Items with no issues must be explicitly marked clean.

## P7/P9/P10 Modes

- **P7 execution**: Use for clear single-feature work. Read reality, design the solution, analyze impact, implement, self-review, and deliver with `[P7-COMPLETION]`.
- **P9 decomposition**: Use when work touches 3+ files, 2+ modules, or unclear scope. The output is Task Prompts, not code.
- **P10 strategy**: Use only for broad multi-system strategy. Output strategy docs with goals, risks, timeline, and resource allocation.

## Agent Invocation Mapping

Claude Code uses the Agent tool with `subagent_type`:

```text
Agent(subagent_type="critic", prompt="Review this diff...")
```

OpenCode uses project agents in `.opencode/agents/`:

```text
@critic review this diff
@fullstack-engineer implement this clear feature
```

## Delegation Matrix

| Situation | Agent |
|---|---|
| Complex task touching 3+ files or 2+ modules | `planner` |
| Clear feature implementation | `fullstack-engineer` |
| New page, UI redesign, landing page, dashboard | `frontend-designer` |
| Large safe refactor | `refactor-specialist` |
| Framework/library major-version upgrade | `migration-engineer` |
| Code review, security review, pre-merge check | `critic` |
| Suspected vulnerability already found | `vuln-verifier` |
| Bug, incident, test failure, unexpected behavior | `debugger` |
| Schema, migration, query safety | `db-expert` |
| First-time codebase exploration | `onboarder` |
| Tool selection or tool/MCP failure | `tool-expert` |
| Official docs, API specs, error lookup | `web-researcher` |

## P7 Completion Format

```markdown
[P7-COMPLETION]

## What I changed
- `path/to/file` — one-line description

## Impact analysis
- Affected callers: list, or none
- Tests run: commands and results

## Self-review
- Correctness: answer
- Side effects: answer
- Closure: answer

## Remaining work
- none, or explicit out-of-scope work
```

## Tooling Notes

- Prefer structured file/search tools over shell equivalents when available.
- In OpenCode, Claude Code hook behavior is not automatic. Use `.opencode/plugins/devteam-safety.js` for safety checks.
- In OpenCode, agent model IDs must be provider-qualified, such as `github-copilot/claude-sonnet-4.6`.

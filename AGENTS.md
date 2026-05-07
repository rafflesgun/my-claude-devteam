# OpenCode Dev Team Rules

This repository provides a 12-agent engineering team for OpenCode and Claude Code. In OpenCode, project agents live in `.opencode/agents/` and are invoked with `@agent-name` or by the Task tool when available.

## Core Workflow

Use the P7/P9/P10 methodology:

- P7: clear single-feature execution by `@fullstack-engineer`.
- P9: multi-file or multi-module decomposition by `@planner`.
- P10: broad strategy work only for large cross-system efforts.

For non-trivial engineering work involving this methodology, load the `devteam-methodology` skill before acting.

## Three Red Lines

- Closure discipline: every task ends with a clear done state.
- Fact-driven: read real files before designing, judging, or implementing.
- Exhaustiveness: complete required checklists and explicitly state clean checks.

## Agent Delegation

Use these OpenCode agents from `.opencode/agents/`:

- `@planner` for complex tasks touching 3+ files or 2+ modules.
- `@fullstack-engineer` for clear feature implementation.
- `@frontend-designer` for new pages, dashboards, landing pages, and visual upgrades.
- `@refactor-specialist` for large safe refactors.
- `@migration-engineer` for framework or library upgrades.
- `@critic` for code review, security review, and pre-merge checks.
- `@vuln-verifier` after `@critic` flags a suspected vulnerability.
- `@debugger` for bugs, incidents, test failures, and unexpected behavior.
- `@db-expert` for schema, migration, and query safety.
- `@onboarder` for first-time codebase exploration.
- `@tool-expert` for tool selection and MCP/tool failures.
- `@web-researcher` for official docs and API lookup.

## OpenCode Notes

The mirrored agents pin GitHub Copilot models by default:

- Reasoning-heavy agents use `github-copilot/claude-opus-4.7`.
- Execution/design/research agents use `github-copilot/claude-sonnet-4.6`.

Claude Code hooks from `settings.example.json` do not automatically run in OpenCode. OpenCode hook-equivalent behavior is implemented through `.opencode/plugins/devteam-safety.js`.

## OpenCode Plugin Capabilities

The `devteam-safety` plugin provides these hooks automatically in OpenCode:

| Hook | What It Does |
|------|-------------|
| `tool.execute.before` | Blocks dangerous commands, protects sensitive files, blocks large reads |
| `tool.execute.after` | Tracks edited files, logs bash commands |
| `session.created` | Detects project context (languages, package manager, CLAUDE.md) |
| `session.idle` | Runs console.log audit on edited files, cleanup |
| `session.deleted` | Clears tracking state |
| `experimental.session.compacting` | Preserves key context across /compact (task status, decisions, edited files) |
| `permission.ask` | Auto-approves reads, formatters, test runners, git status |
| `shell.env` | Injects PROJECT_ROOT, PACKAGE_MANAGER, DETECTED_LANGUAGES |
| `todo.updated` | Logs task completion progress |
| `file.watcher.updated` | Tracks external file changes for audit |

Session instructions are loaded from `.opencode/instructions/INSTRUCTIONS.md`.

# OpenCode Compatibility

This repository supports OpenCode in addition to Claude Code.

## What OpenCode Uses

- `AGENTS.md` gives OpenCode project-level rules and the P7/P9/P10 delegation model.
- `.opencode/agents/*.md` contains OpenCode-native mirrors of the 12 Claude Code agents.
- `.claude/skills/devteam-methodology/SKILL.md` is discovered by both Claude-compatible skill loaders and OpenCode.
- `.opencode/plugins/devteam-safety.js` ports the highest-value Claude hook behavior to OpenCode plugin events.
- `opencode.example.json` is a reference project config. Copy it to `opencode.json` only if you want these defaults in a project.

## Install Into A Project

From this repo, copy the OpenCode files into the target project:

```bash
cp -R .opencode /path/to/project/.opencode
cp -R .claude/skills /path/to/project/.claude/skills
cp AGENTS.md /path/to/project/AGENTS.md
cp opencode.example.json /path/to/project/opencode.json
```

The `opencode.json` copy is optional. OpenCode automatically discovers root `AGENTS.md`, `.opencode/agents/`, `.opencode/plugins/`, and project skills.

Restart OpenCode after copying skill or plugin files. Existing sessions may not refresh the discovered skill list until a new OpenCode process starts.

## Agents

Invoke agents with `@agent-name`:

```text
@planner break this feature into implementation tasks
@fullstack-engineer implement this clear endpoint
@critic review the current diff
```

The OpenCode mirrors pin GitHub Copilot models by default:

| Agent group | Model |
|---|---|
| `planner`, `critic`, `vuln-verifier`, `debugger`, `db-expert` | `github-copilot/claude-opus-4.7` |
| `fullstack-engineer`, `frontend-designer`, `migration-engineer`, `refactor-specialist`, `onboarder`, `tool-expert`, `web-researcher` | `github-copilot/claude-sonnet-4.6` |

If your Copilot subscription does not expose those models, run `opencode models` and replace the `model:` values in `.opencode/agents/*.md`.

## Skills

The shared skill is `devteam-methodology`.

Use it before non-trivial work involving the 12-agent team, P7/P9/P10 methodology, delegation, or cross-runtime compatibility.

OpenCode discovers skills from these locations, including this repo's chosen path:

- `.opencode/skills/<name>/SKILL.md`
- `.claude/skills/<name>/SKILL.md`
- `.agents/skills/<name>/SKILL.md`

## Plugin Events

Claude Code hooks do not run in OpenCode. The closest OpenCode equivalent is plugin events.

| Claude Code hook | OpenCode event | Ported behavior |
|---|---|---|
| `PreToolUse` for Bash | `tool.execute.before` | Blocks dangerous shell commands, force pushes, and `--no-verify`. |
| `PreToolUse` for Write/Edit | `tool.execute.before` | Blocks writes to likely secret/config files. |
| `PreToolUse` for Read | `tool.execute.before` | Blocks reads of files larger than 2 MB. |
| `PostToolUse` for Bash | `tool.execute.after` | Logs bash command execution. |
| `PostToolUse` for Write/Edit | `tool.execute.after` | Tracks edited files for later checks. |
| `Stop` | `session.idle` | Runs best-effort idle checks for edited files. |
| `SessionStart` | `session.created` | Logs plugin activation. |
| `PostToolUseFailure` | `session.error` | Logs session-level errors. |

The plugin also registers direct event hooks where OpenCode supports them and a catch-all `event` handler for session events. This keeps the checks compatible with documented examples and newer event-specific dispatch.

The plugin intentionally implements safety checks natively instead of depending on `~/.claude/hooks`. This makes it portable to projects that only install the OpenCode files.

## Known Gaps

- OpenCode `session.idle` is the closest equivalent to Claude Code `Stop`, but it is not identical.
- Token/cost tracking is not fully ported because the documented plugin events do not guarantee the same usage payloads as Claude Code hooks.
- MCP health checks depend on the tool names OpenCode exposes in a given session, so the first plugin pass logs errors rather than making MCP-specific assumptions.

## Reference Config

`opencode.example.json` sets a Copilot Sonnet default model, Copilot Haiku small model, allows the `devteam-methodology` skill, and uses cautious `ask` permissions for edits, bash, and task dispatch.

Use it as a starting point:

```bash
cp opencode.example.json opencode.json
```

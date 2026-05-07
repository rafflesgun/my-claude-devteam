# Installation Guide

> For agents: read this file top to bottom and execute the steps in order.

## Choose your install path

1. If you use Claude Code, install the plugin version.
2. If you want a local/manual install, copy the files into your Claude config directory.
3. If you use OpenCode, install the project-local files into your target repo.

## Claude Code plugin install

1. Run:

```bash
/plugin marketplace add NYCU-Chung/my-claude-devteam
/plugin install devteam@my-claude-devteam
```

2. Restart Claude Code.
3. Confirm the team is available by checking that the agents and hooks load automatically.

## Manual Claude Code install

Use this if you do not want the plugin system.

1. Clone the repository:

```bash
git clone https://github.com/NYCU-Chung/my-claude-devteam ~/my-claude-devteam
```

2. Back up any existing Claude config directories:

```bash
mv ~/.claude/agents ~/.claude/agents.bak 2>/dev/null
mv ~/.claude/hooks ~/.claude/hooks.bak 2>/dev/null
```

3. Copy the agents, hooks, settings, and optional methodology file:

```bash
cp -r ~/my-claude-devteam/agents ~/.claude/
cp -r ~/my-claude-devteam/hooks ~/.claude/
cp ~/my-claude-devteam/settings.example.json ~/.claude/settings.json
# Optional:
# cp ~/my-claude-devteam/CLAUDE.en.md ~/.claude/CLAUDE.md
```

4. If you want the methodology file to apply across sessions, copy one of the `CLAUDE.*.md` files to `~/.claude/CLAUDE.md`.
5. Restart Claude Code.

## OpenCode install

Use this if you want the project-local OpenCode setup.

1. Copy the OpenCode files into the target project:

```bash
cp -R .opencode /path/to/project/.opencode
cp -R .claude/skills /path/to/project/.claude/skills
cp AGENTS.md /path/to/project/AGENTS.md
cp opencode.example.json /path/to/project/opencode.json
```

2. Use agents with `@planner`, `@fullstack-engineer`, `@critic`, and the other agent names.
3. Read `docs/opencode.md` if you need the model mapping or hook parity notes.

## How an agent should use this file

1. Read `INSTALL.md` first.
2. Follow the section that matches the target environment.
3. Stop if the target environment is unclear and ask the user which install path they want.
4. After installation, verify the agent names and hooks are available in the target environment.

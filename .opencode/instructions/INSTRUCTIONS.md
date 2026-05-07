# Dev Team Session Instructions

This document is loaded automatically by the OpenCode plugin on session start.

## Security (Critical)

Before any commit:
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- No mutation — always return new objects
- Error messages must not leak sensitive data

If a security issue is found:
1. STOP immediately
2. Delegate to `@critic` for review
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets

## Coding Standards

- Many small files > few large files (200-400 lines typical, 800 max)
- Functions under 50 lines, nesting under 4 levels
- No `console.log` in production code
- Immutable patterns: spread/map/filter over push/mutate
- Organize by feature/domain, not by type

## Testing

- Minimum 80% coverage
- TDD workflow: RED -> GREEN -> IMPROVE
- All three test types required: unit, integration, E2E
- Fix implementation, not tests (unless tests are wrong)

## Git Workflow

- Commit format: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci)
- Never push with --no-verify
- Never force-push to main/master
- Review diff before pushing: `git diff origin/main...HEAD`

## Agent Delegation

No user prompt needed for these situations:
- Complex feature -> `@planner`
- Code just written/modified -> `@critic`
- Bug or new feature -> `@fullstack-engineer` (P7 mode)
- Architectural decision -> `@planner` (P9 mode)

## Context Management

- Avoid last 20% of context window for complex tasks
- Use `/compact` proactively at ~50 tool calls
- The compaction hook preserves: task status, decisions, edited files, remaining work, security concerns

## Plugin Capabilities

The devteam-safety plugin provides these hooks automatically:
- **Dangerous command blocking**: rm -rf, --no-verify, force push to main
- **Sensitive file protection**: .env, .pem, .key, credentials
- **Large file read blocking**: files > 2MB
- **Edit tracking**: all modified files tracked for audit
- **Context compaction**: key context preserved across /compact
- **Permission auto-approve**: reads, formatters, test runners, git status
- **Progress tracking**: todo completion logged
- **File watching**: external changes detected and tracked
- **Shell env injection**: PROJECT_ROOT, PACKAGE_MANAGER, DETECTED_LANGUAGES

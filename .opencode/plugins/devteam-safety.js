import fs from "fs"
import path from "path"

const editedFiles = new Set()
const pendingToolChanges = new Map()
let writeCounter = 0

function getCommand(args) {
  return String(args?.command || "")
}

function getFilePath(args) {
  if (!args) return ""
  const p = args.filePath ?? args.file_path ?? args.path
  return typeof p === "string" && p.trim() ? p : ""
}

function getTool(input) {
  return String(input?.tool || input?.name || "")
}

function getArgs(input, output) {
  return { ...(input?.args || {}), ...(output?.args || {}) }
}

function isEditTool(tool) {
  return ["write", "edit", "apply_patch"].includes(tool)
}

function isSensitivePath(filePath) {
  return /(\.env|\.pem|\.key|\.pfx|\.p12|\.snk)$|(^|\/)secrets(\/|$)|credentials|secrets\.json|appsettings\.(Production|Staging|Prod)\.json|\.pubxml(\.user)?$|\.csproj\.user$/i.test(filePath)
}

function blocksDangerousCommand(command) {
  const checks = [
    [/\brm\s+.*(-[a-zA-Z]*r[a-zA-Z]*f|--recursive.*--force|-rf)\b/, "BLOCKED: rm -rf is dangerous"],
    [/--no-verify\b/, "BLOCKED: --no-verify is not allowed. Let git hooks run."],
    [/\bgit\s+push\b.*(-f|--force)\b.*\b(main|master)\b/, "BLOCKED: force pushing to main/master is not allowed"],
    [/\bgit\s+commit\b.*\b(main|master|production|release)\b/, "BLOCKED: direct protected-branch commit command detected"],
  ]
  for (const [pattern, message] of checks) {
    if (pattern.test(command)) return message
  }
  return null
}

function maybeBlockLargeRead(worktree, filePath) {
  if (!filePath) return
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(worktree, filePath)
  if (!fs.existsSync(absolute)) return
  const stat = fs.statSync(absolute)
  if (!stat.isFile()) return
  const twoMb = 2 * 1024 * 1024
  if (stat.size > twoMb) {
    throw new Error(`BLOCKED: ${filePath} is larger than 2MB; use targeted search or a smaller slice`)
  }
}

function hasProjectFile(worktree, relativePath) {
  try {
    const absolute = path.isAbsolute(relativePath) ? relativePath : path.join(worktree, relativePath)
    return fs.existsSync(absolute)
  } catch {
    return false
  }
}

function resolvePath(worktree, p) {
  if (path.isAbsolute(p)) return p
  return path.join(worktree, p)
}

async function log(client, level, message, extra = {}) {
  if (!client?.app?.log) return
  await client.app.log({
    body: {
      service: "devteam-safety",
      level,
      message,
      extra,
    },
  })
}

async function runIfExists($, worktree, script) {
  const scriptPath = path.join(worktree, "hooks", script)
  if (!fs.existsSync(scriptPath)) return { skipped: true, script }
  const result = await $`node ${scriptPath}`.quiet().nothrow()
  return { script, exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

function buildCompactionContext(editedFiles, worktree) {
  const contextBlock = [
    "# Dev Team Context (preserve across compaction)",
    "",
    "## Active Plugin: devteam-safety",
    "- Hooks: tool.execute.before/after, session.created/idle/deleted, experimental.session.compacting, permission.ask, shell.env, todo.updated, file.watcher.updated",
    "- Agents: 12 specialized (planner, fullstack-engineer, frontend-designer, refactor-specialist, migration-engineer, critic, vuln-verifier, debugger, db-expert, onboarder, tool-expert, web-researcher)",
    "",
    "## Three Red Lines",
    "- Closure discipline: every task ends with a clear done state",
    "- Fact-driven: read real files before designing, judging, or implementing",
    "- Exhaustiveness: complete required checklists and explicitly state clean checks",
    "",
    "## P7/P9/P10 Methodology",
    "- P7: clear single-feature execution by @fullstack-engineer",
    "- P9: multi-file or multi-module decomposition by @planner",
    "- P10: broad strategy work only for large cross-system efforts",
    "",
  ]

  if (editedFiles.size > 0) {
    contextBlock.push("## Recently Edited Files")
    for (const f of editedFiles) {
      contextBlock.push(`- ${f}`)
    }
    contextBlock.push("")
  }

  const detectedLangs = []
  const langDetectors = {
    "tsconfig.json": "typescript",
    "go.mod": "go",
    "pyproject.toml": "python",
    "Cargo.toml": "rust",
    "Package.swift": "swift",
    "*.csproj": "csharp",
  }
  for (const [file, lang] of Object.entries(langDetectors)) {
    if (hasProjectFile(worktree, file)) {
      detectedLangs.push(lang)
    }
  }
  if (detectedLangs.length > 0) {
    contextBlock.push(`## Detected Languages: ${detectedLangs.join(", ")}`)
    contextBlock.push("")
  }

  return {
    context: contextBlock.join("\n"),
    compaction_prompt: "Focus on preserving: 1) Current task status and progress, 2) Key decisions made, 3) Files created/modified, 4) Remaining work items, 5) Any security concerns flagged. Discard: verbose tool outputs, intermediate exploration, redundant file listings.",
  }
}

function buildShellEnv(worktree) {
  const env = {
    DEVTEAM_PLUGIN: "true",
    PROJECT_ROOT: worktree,
  }

  const lockfiles = {
    "bun.lockb": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
  }
  for (const [lockfile, pm] of Object.entries(lockfiles)) {
    if (hasProjectFile(worktree, lockfile)) {
      env.PACKAGE_MANAGER = pm
      break
    }
  }

  const langDetectors = {
    "tsconfig.json": "typescript",
    "go.mod": "go",
    "pyproject.toml": "python",
    "Cargo.toml": "rust",
    "Package.swift": "swift",
  }
  const detected = []
  for (const [file, lang] of Object.entries(langDetectors)) {
    if (hasProjectFile(worktree, file)) {
      detected.push(lang)
    }
  }
  if (detected.length > 0) {
    env.DETECTED_LANGUAGES = detected.join(",")
    env.PRIMARY_LANGUAGE = detected[0]
  }

  return env
}

export const DevteamSafetyPlugin = async ({ client, $, worktree, directory }) => {
  const worktreePath = worktree || directory

  async function handleSessionCreated() {
    await log(client, "info", "OpenCode devteam safety plugin active")

    if (hasProjectFile(worktreePath, "CLAUDE.md")) {
      await log(client, "info", "Found CLAUDE.md - loading project context")
    }
    if (hasProjectFile(worktreePath, "AGENTS.md")) {
      await log(client, "info", "Found AGENTS.md - loading devteam rules")
    }

    const env = buildShellEnv(worktreePath)
    const envParts = []
    if (env.PACKAGE_MANAGER) envParts.push(`pkg=${env.PACKAGE_MANAGER}`)
    if (env.DETECTED_LANGUAGES) envParts.push(`langs=${env.DETECTED_LANGUAGES}`)
    if (envParts.length > 0) {
      await log(client, "info", `Project detected: ${envParts.join(", ")}`)
    }
  }

  async function handleSessionError(event) {
    await log(client, "error", "session error", { event })
  }

  async function handleSessionIdle() {
    if (editedFiles.size === 0) return
    const files = Array.from(editedFiles)

    const results = []
    results.push(await runIfExists($, worktreePath, "check-console.js"))
    results.push(await runIfExists($, worktreePath, "dotnet-debug-check.js"))

    let totalConsoleLog = 0
    const filesWithConsoleLog = []
    for (const file of files) {
      if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue
      try {
        const result = await $`grep -c "console\\.log" ${file} 2>/dev/null`.text()
        const count = parseInt(result.trim(), 10)
        if (count > 0) {
          totalConsoleLog += count
          filesWithConsoleLog.push(file)
        }
      } catch {}
    }

    if (totalConsoleLog > 0) {
      await log(client, "warn", `console.log audit: ${totalConsoleLog} statement(s) in ${filesWithConsoleLog.length} file(s)`, { files: filesWithConsoleLog })
    }

    editedFiles.clear()
    pendingToolChanges.clear()

    await log(client, "info", "session idle checks completed", { files, results })
  }

  return {
    "tool.execute.before": async (input, output) => {
      const tool = getTool(input)
      const args = getArgs(input, output)

      if (tool === "bash") {
        const blocked = blocksDangerousCommand(getCommand(args))
        if (blocked) throw new Error(blocked)
      }

      if (tool === "write") {
        const filePath = getFilePath(args)
        if (filePath) {
          const absPath = resolvePath(worktreePath, filePath)
          let type = "modified"
          try {
            if (fs.existsSync(absPath)) type = "modified"
            else type = "added"
          } catch {}
          const key = input?.callID ?? `write-${++writeCounter}-${filePath}`
          pendingToolChanges.set(key, { path: filePath, type })
        }

        if (filePath && isSensitivePath(filePath)) {
          throw new Error(`BLOCKED: Cannot modify sensitive file: ${filePath}`)
        }
      }

      if (tool === "edit") {
        const filePath = getFilePath(args)
        if (filePath && isSensitivePath(filePath)) {
          throw new Error(`BLOCKED: Cannot modify sensitive file: ${filePath}`)
        }
      }

      if (tool === "read") {
        maybeBlockLargeRead(worktreePath, getFilePath(args))
      }

      if (tool === "bash") {
        const cmd = getCommand(args)
        if (cmd.match(/^git\s+push/) && !cmd.includes("--force")) {
          await log(client, "info", "git push detected - review changes first: git diff origin/main...HEAD")
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      const tool = getTool(input)
      const args = getArgs(input, output)

      if (tool === "write") {
        const filePath = getFilePath(args)
        if (filePath) {
          const key = input?.callID ?? `write-${writeCounter}-${filePath}`
          const pending = pendingToolChanges.get(key)
          if (pending) {
            editedFiles.add(pending.path)
            pendingToolChanges.delete(key)
          } else {
            editedFiles.add(filePath)
          }
        }
      }

      if (tool === "edit") {
        const filePath = getFilePath(args)
        if (filePath) editedFiles.add(filePath)
      }

      if (tool === "bash") {
        await log(client, "info", "bash command executed", { command: getCommand(args) })
      }
    },

    "session.created": async () => {
      await handleSessionCreated()
    },

    "session.error": async (event) => {
      await handleSessionError(event)
    },

    "session.idle": async () => {
      await handleSessionIdle()
    },

    "session.deleted": async () => {
      editedFiles.clear()
      pendingToolChanges.clear()
      writeCounter = 0
      await log(client, "info", "session ended - cleaned up tracking state")
    },

    "experimental.session.compacting": async () => {
      const result = buildCompactionContext(editedFiles, worktreePath)
      await log(client, "info", "context compaction - preserving devteam context block")
      return result
    },

    "permission.ask": async (event) => {
      const tool = String(event?.tool || "")
      const cmd = String((event?.args?.command || event?.args || ""))

      if (["read", "glob", "grep", "search", "list"].includes(tool)) {
        return { approved: true, reason: "Read-only operation" }
      }

      if (tool === "bash" && /^(npx )?(prettier|biome|black|gofmt|rustfmt|swift-format)/.test(cmd)) {
        return { approved: true, reason: "Formatter execution" }
      }

      if (tool === "bash" && /^(npm test|npx vitest|npx jest|pytest|go test|cargo test|dotnet test)/.test(cmd)) {
        return { approved: true, reason: "Test execution" }
      }

      if (tool === "bash" && /^(git status|git diff|git log|git branch)/.test(cmd)) {
        return { approved: true, reason: "Read-only git operation" }
      }

      return { approved: undefined }
    },

    "shell.env": async () => {
      return buildShellEnv(worktreePath)
    },

    "todo.updated": async (event) => {
      const todos = event?.todos || []
      const completed = todos.filter((t) => t.done || t.status === "completed").length
      const total = todos.length
      if (total > 0) {
        await log(client, "info", `Progress: ${completed}/${total} tasks completed`)
      }
    },

    "file.watcher.updated": async (event) => {
      if (!event?.path) return
      const changeType = event.type === "create" || event.type === "add" ? "added"
        : event.type === "delete" || event.type === "remove" ? "deleted"
        : "modified"
      if (changeType === "modified" || changeType === "added") {
        if (event.path.match(/\.(ts|tsx|js|jsx|py|go|rs|cs|java|kt|swift)$/)) {
          editedFiles.add(event.path)
        }
      }
    },

    event: async (payload) => {
      const event = payload?.event || payload
      if (event?.type === "session.created") await handleSessionCreated()
      if (event?.type === "session.error") await handleSessionError(event)
      if (event?.type === "session.idle") await handleSessionIdle()
    },
  }
}

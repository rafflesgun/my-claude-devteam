import fs from "fs"
import path from "path"

const editedFiles = new Set()

function getCommand(args) {
  return String(args?.command || "")
}

function getFilePath(args) {
  return String(args?.filePath || args?.file_path || args?.path || "")
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

export const DevteamSafetyPlugin = async ({ client, $, worktree }) => {
  async function handleSessionCreated() {
    await log(client, "info", "OpenCode devteam safety plugin active")
  }

  async function handleSessionError(event) {
    await log(client, "error", "session error", { event })
  }

  async function handleSessionIdle() {
    if (editedFiles.size === 0) return
    const files = Array.from(editedFiles)
    editedFiles.clear()

    const results = []
    results.push(await runIfExists($, worktree, "check-console.js"))
    results.push(await runIfExists($, worktree, "dotnet-debug-check.js"))

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

      if (isEditTool(tool)) {
        const filePath = getFilePath(args)
        if (filePath && isSensitivePath(filePath)) {
          throw new Error(`BLOCKED: Cannot modify sensitive file: ${filePath}`)
        }
      }

      if (tool === "read") {
        maybeBlockLargeRead(worktree, getFilePath(args))
      }
    },

    "tool.execute.after": async (input, output) => {
      const tool = getTool(input)
      const args = getArgs(input, output)
      if (isEditTool(tool)) {
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

    event: async (payload) => {
      const event = payload?.event || payload
      if (event?.type === "session.created") await handleSessionCreated()
      if (event?.type === "session.error") await handleSessionError(event)
      if (event?.type === "session.idle") await handleSessionIdle()
    },
  }
}

# Hooks

**[English](./README.md) · 繁體中文**

自動化 hooks 接在 Claude Code 的 lifecycle events 上（`PreToolUse`、`PostToolUse`、`Stop`、`SessionStart`），在常見問題上 production 之前就攔下來：硬編密碼、debugger 語句、MCP 斷線、成本失控、AI slop UI、漏網的 debug 殘留等。

Hook 套件自動偵測專案語言 — JS/TS、C#/.NET、Python、Rust、Go、Vue — 不需要分開的語言特定 hooks。每個統一的 hook 內部處理所有支援的語言。

每個 hook 都是不到 75 行的獨立腳本。除了 Node.js 和標準 Unix 工具（`jq`、`git`、`grep`）之外沒有依賴。

## 支援語言

| 語言 | 副檔名 | 品質檢查 | 測試執行 | Debug 偵測 | Config 保護 |
|------|--------|---------|---------|------------|-------------|
| JS/TS | `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | Prettier + tsc | vitest / jest | `console.log`、`debugger` | ESLint、Prettier、Biome、Stylelint |
| C#/.NET | `.cs` `.razor` `.cshtml` | dotnet format + build | dotnet test | `Console.WriteLine`、`Debugger.Break` | `.editorconfig`、`Directory.Build.*`、`NuGet.config` |
| Python | `.py` | ruff check | pytest | `print()`、`pdb.set_trace()`、`breakpoint()` | `pyproject.toml`、`ruff.toml`、`.flake8`、`mypy.ini` |
| Rust | `.rs` | cargo fmt --check + cargo check | cargo test | `dbg!()`、`println!()` | `Cargo.toml`、`rustfmt.toml`、`clippy.toml` |
| Go | `.go` | go fmt | go test | `fmt.Println()`、`log.Fatal()` | `go.mod` |
| Vue | `.vue` | — | — | `console.log` | — |

## Hooks 清單

### 💰 `cost-tracker.js`
**觸發：** `Stop`（每次回覆後）
**做什麼：** 從 response payload 讀 token 用量，乘上每個 model 的費率（Opus / Sonnet / Haiku），append 一筆 JSONL 紀錄到 `~/.claude/metrics/costs.jsonl`。

### ✋ `commit-quality.js`
**觸發：** `PreToolUse` on `Bash`（指令含 `git commit` 時）
**做什麼：** 在每次 commit 前，掃描 staged 檔案中的語言特定 debug/blocker patterns（JS/TS 的 `debugger`、C# 的 `Debugger.Break/Launch`、Python 的 `pdb.set_trace()` 和 `breakpoint()`），以及硬編密碼。

### 🔧 `mcp-health.js`
**觸發：** `PreToolUse` on `mcp__*`（檢查），`PostToolUseFailure` on `mcp__*`（追蹤）
**做什麼：** 用指數退避追蹤 MCP server 健康狀態。

### 🛡 `config-protection.js`
**觸發：** `PreToolUse` on `Write | Edit`
**做什麼：** 阻擋對所有支援語言的 linter/formatter/build config 的直接編輯。設 `CLAUDE_ALLOW_CONFIG_EDIT=1` 可繞過。

### 🎨 `design-quality.js`
**觸發：** `PostToolUse` on `Write | Edit`
**做什麼：** 在前端檔案編輯時，掃描通用 AI slop 訊號。

### 📝 `check-console.js`
**觸發：** `Stop`（每次回覆後）
**做什麼：** 掃描修改過的檔案中的語言特定 debug/log 殘留（`console.log`、`Console.WriteLine`、`dbg!()`、`println!()`、`print()`、`fmt.Println()` 等）。

### 📊 `audit-log.js`
**觸發：** `PostToolUse` on `Bash`
**做什麼：** 把每個 Bash 指令 append 到 `~/.claude/bash-commands.log`，自動遮罩常見密碼 pattern。

### 🔍 `quality-check.js`
**觸發：** `Stop`（每次回覆後）
**做什麼：** 讀這個 session 編輯過的檔案清單，自動偵測語言，跑對應的品質工具：
- **JS/TS：** `prettier --write` + `npx tsc --noEmit`
- **C#/.NET：** `dotnet format --verify-no-changes` + `dotnet build`
- **Python：** `ruff check`
- **Rust：** `cargo fmt --check` + `cargo check`
- **Go：** `go fmt`

### 📈 `accumulator.js`
**觸發：** `PostToolUse` on `Write | Edit`
**做什麼：** `quality-check.js` 的搭檔。每次檔案被編輯，自動偵測語言並把路徑 append 到對應的 session temp file。

### 💡 `suggest-compact.js`
**觸發：** `PreToolUse` on `Write | Edit`
**做什麼：** 第 50 次 tool call 提醒考慮 `/compact`，之後每 25 次再提醒。

### 🚨 `log-error.sh`
**觸發：** `PostToolUse` on `.*`
**做什麼：** 工具輸出含錯誤關鍵字時，append 結構化紀錄到 `~/.claude/error-log.md`。

### 🧪 `test-runner.js`
**觸發：** `PostToolUse` on `Write | Edit`
**做什麼：** 自動偵測語言並跑對應的測試：vitest/jest（JS/TS）、dotnet test（C#）、pytest（Python）、cargo test（Rust）、go test（Go）。

### 🔒 `branch-protection.js`
**觸發：** `PreToolUse` on `Bash`
**做什麼：** 硬擋 force push 和在受保護分支上直接 commit。

### 📏 `large-file-warner.js`
**觸發：** `PreToolUse` on `Read`
**做什麼：** 500 KB 警告，2 MB 硬擋。

### 📚 `session-summary.js`
**觸發：** `Stop`
**做什麼：** Append session 摘要到 `~/.claude/sessions/`。

## 安裝

```bash
# 1. 複製 hooks 到 ~/.claude/hooks/
cp hooks/*.js ~/.claude/hooks/
cp hooks/log-error.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/log-error.sh

# 2. 複製範例 settings
cp settings.example.json ~/.claude/settings.json

# 3. 重啟 Claude Code
```

## 新增語言

所有語言特定邏輯都在 `lang-utils.js`。要新增語言：

1. 在 `LANG_CONFIG` 加一個新條目，包含副檔名、debug patterns、config 檔案、測試設定和品質檢查指令
2. 現有的 hooks 會自動支援新語言 — 不需要改其他檔案

## 安全哲學

這些 hooks 用**確定性規則**取代人工確認和審查。它們會抓到最常見的失敗模式：`rm -rf`、force push 到 main、`--no-verify`、commit 進密碼、commit 進 debugger、編輯敏感 config、放寬的 linter/build config。

當作 safety net，不是 review 的替代品。

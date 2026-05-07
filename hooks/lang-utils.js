const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LANG_CONFIG = {
  csharp: {
    exts: /\.(cs|csx|razor|cshtml)$/i,
    projectFiles: /\.(sln|csproj|fsproj|vbproj)$/i,
    testFrameworks: /(xunit|NUnit|MSTest|Microsoft\.NET\.Test\.Sdk)/i,
    testProjName: /(Tests?|Specs?)\./,
    testDir: /(^|[\\/])(test|tests|spec|specs)([\\/]|$)/i,
    generatedRe: /(^|[\\/])(bin|obj)[\\/]/,
    generatedExtRe: /\.(g|designer)\.cs$/i,
    configFiles: new Set([
      '.editorconfig', 'Directory.Build.props', 'Directory.Build.targets',
      'Directory.Packages.props', 'global.json', 'NuGet.config',
      'packages.lock.json', 'stylecop.json', 'CodeAnalysis.ruleset',
    ]),
    configExtRe: /\.ruleset$|\.sln\.DotSettings$/i,
    sensitiveFiles: /^appsettings(\.[^.]+)?\.json$/i,
    debugPatterns: [
      /\bConsole\.WriteLine\s*\(/,
      /\bDebug\.WriteLine\s*\(/,
      /\bTrace\.WriteLine\s*\(/,
      /\bDebugger\.(Break|Launch)\s*\(/,
    ],
    commitBlockers: [
      { re: /\bDebugger\.(Break|Launch)\s*\(/, label: 'Debugger breakpoint/launcher' },
      { re: /\bSystem\.Diagnostics\.Debugger\.(Break|Launch)\s*\(/, label: 'Debugger breakpoint/launcher' },
      { re: /(Server|Data Source)\s*=.+;\s*(Database|Initial Catalog)\s*=.+;.+Password\s*=\s*[^;\s]+/i, label: 'connection string with password' },
      { re: /AccountKey\s*=\s*[A-Za-z0-9+/=]{40,}/i, label: 'Azure Storage account key' },
      { re: /(Jwt|Token|SigningKey|IssuerSigningKey)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{32,}["']/i, label: 'JWT/token signing secret' },
    ],
    formatCmd: 'dotnet',
    formatArgs: (target) => ['format', target, '--verify-no-changes', '--no-restore', '--verbosity', 'minimal'],
    buildCmd: 'dotnet',
    buildArgs: (target) => ['build', target, '--no-restore'],
    testCmd: 'dotnet',
    testArgs: (proj, filter) => ['test', proj, '--no-restore', '--filter', `FullyQualifiedName~${filter}`],
    cliCheck: 'dotnet',
    cliCheckArgs: ['--version'],
  },
  python: {
    exts: /\.py$/i,
    projectFiles: /(pyproject\.toml|setup\.py|setup\.cfg|requirements\.txt|Pipfile|uv\.lock)$/i,
    testFrameworks: /(pytest|unittest|nose)/i,
    testDir: /(^|[\\/])(test|tests|spec|specs)([\\/]|$)/i,
    generatedRe: /(^|[\\/])(__pycache__|\.venv|venv|\.mypy_cache)[\\/]/,
    configFiles: new Set([
      'pyproject.toml', 'setup.cfg', 'tox.ini', '.flake8', 'mypy.ini', '.mypy.ini',
      'ruff.toml', '.ruff.toml', '.isort.cfg',
    ]),
    debugPatterns: [
      /\bbreakpoint\s*\(/,
      /\bpdb\.set_trace\s*\(/,
      /\bipdb\s*\(/,
      /\bpudb\.set_trace\s*\(/,
      /\bprint\s*\(/,
    ],
    commitBlockers: [
      { re: /\bpdb\.set_trace\s*\(/, label: 'pdb breakpoint' },
      { re: /\bbreakpoint\s*\(/, label: 'Python breakpoint()' },
    ],
    formatCmd: null,
    buildCmd: null,
    testCmd: null,
    cliCheck: 'python3',
    cliCheckArgs: ['--version'],
  },
  rust: {
    exts: /\.rs$/i,
    projectFiles: /Cargo\.toml$/i,
    testFrameworks: null,
    testDir: /(^|[\\/])(tests)[\\/]/i,
    generatedRe: /(^|[\\/])(target)[\\/]/,
    configFiles: new Set([
      'Cargo.toml', 'clippy.toml', 'rustfmt.toml', '.rustfmt.toml', 'rust-toolchain.toml',
    ]),
    debugPatterns: [
      /\bdbg!\s*\(/,
      /\bprintln!\s*\(/,
      /\beprintln!\s*\(/,
    ],
    commitBlockers: [],
    formatCmd: 'cargo',
    formatArgs: () => ['fmt', '--check'],
    buildCmd: 'cargo',
    buildArgs: () => ['check'],
    testCmd: 'cargo',
    testArgs: (_proj, filter) => filter ? ['test', filter] : ['test'],
    cliCheck: 'cargo',
    cliCheckArgs: ['--version'],
  },
  go: {
    exts: /\.go$/i,
    projectFiles: /go\.mod$/i,
    testFrameworks: null,
    testDir: null,
    testFileRe: /_test\.go$/,
    generatedRe: /(^|[\\/])(vendor)[\\/]/,
    configFiles: new Set(['go.mod']),
    debugPatterns: [
      /\blog\.Fatal\s*\(/,
      /\blog\.Panic\s*\(/,
      /\bfmt\.Println?\s*\(/,
    ],
    commitBlockers: [],
    formatCmd: 'go',
    formatArgs: () => ['fmt', './...'],
    buildCmd: 'go',
    buildArgs: () => ['build', './...'],
    testCmd: 'go',
    testArgs: () => ['test', './...'],
    cliCheck: 'go',
    cliCheckArgs: ['version'],
  },
  jsts: {
    exts: /\.(ts|tsx|js|jsx|mjs|cjs)$/i,
    projectFiles: /(package\.json|tsconfig\.json)$/i,
    testFrameworks: /(vitest|jest|mocha)/i,
    testDir: /(^|[\\/])(__tests__|test|tests|spec|specs)([\\/]|$)/i,
    testFileRe: /\.(test|spec)\.[jt]sx?$/i,
    generatedRe: /(^|[\\/])(node_modules|dist|\.next|\.nuxt|build)[\\/]/,
    configFiles: new Set([
      '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
      'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts',
      '.prettierrc', '.prettierrc.js', '.prettierrc.json',
      'prettier.config.js', 'prettier.config.mjs',
      'biome.json', 'biome.jsonc',
      '.stylelintrc', '.stylelintrc.json',
    ]),
    debugPatterns: [
      /\bconsole\.log\b/,
    ],
    commitBlockers: [
      { re: /\bdebugger\b/, label: 'debugger statement' },
    ],
    formatCmd: null,
    buildCmd: null,
    testCmd: null,
    cliCheck: 'node',
    cliCheckArgs: ['--version'],
  },
  vue: {
    exts: /\.vue$/i,
    projectFiles: null,
    testDir: /(^|[\\/])(__tests__|test|tests|spec|specs)([\\/]|$)/i,
    generatedRe: /(^|[\\/])(node_modules|dist|\.nuxt)[\\/]/,
    debugPatterns: [
      /\bconsole\.log\b/,
    ],
    commitBlockers: [],
    formatCmd: null,
    buildCmd: null,
    testCmd: null,
    cliCheck: null,
    cliCheckArgs: [],
  },
};

function sessionId() {
  return (process.env.CLAUDE_SESSION_ID || crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
}

function accumulatorPath(lang) {
  return path.join(os.tmpdir(), `claude-${lang}-edited-${sessionId()}.txt`);
}

function detectLang(filePath) {
  if (!filePath) return null;
  const base = path.basename(filePath);
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    if (cfg.exts && cfg.exts.test(filePath)) return lang;
    if (cfg.configFiles && cfg.configFiles.has(base)) return lang;
    if (cfg.sensitiveFiles && cfg.sensitiveFiles.test(base)) return lang;
    if (cfg.configExtRe && cfg.configExtRe.test(base)) return lang;
  }
  return null;
}

function isGeneratedOrBuildOutput(filePath) {
  for (const cfg of Object.values(LANG_CONFIG)) {
    if (cfg.generatedRe && cfg.generatedRe.test(filePath)) return true;
    if (cfg.generatedExtRe && cfg.generatedExtRe.test(filePath)) return true;
  }
  return false;
}

function isTestPath(filePath) {
  for (const cfg of Object.values(LANG_CONFIG)) {
    if (cfg.testDir && cfg.testDir.test(filePath)) return true;
    if (cfg.testFileRe && cfg.testFileRe.test(filePath)) return true;
    if (cfg.testProjName && cfg.testProjName.test(path.basename(filePath))) return true;
  }
  return false;
}

function isLangFile(filePath, lang) {
  if (!filePath) return false;
  const detected = detectLang(filePath);
  if (lang) return detected === lang;
  return detected !== null;
}

function readAccumulatedFiles(lang, { clear = false } = {}) {
  const file = accumulatorPath(lang);
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  if (clear) { try { fs.unlinkSync(file); } catch (e) {} }
  return [...new Set(raw.split('\n').map(line => line.trim()).filter(Boolean))]
    .filter(fp => fs.existsSync(fp));
}

function appendAccumulatedFile(filePath) {
  const lang = detectLang(filePath);
  if (!lang || isGeneratedOrBuildOutput(filePath)) return;
  fs.appendFileSync(accumulatorPath(lang), filePath + '\n');
}

function findUp(startDir, predicate) {
  let dir = path.resolve(startDir || process.cwd());
  while (true) {
    let names;
    try { names = fs.readdirSync(dir); } catch (e) { return null; }
    const hit = names.find(name => predicate(path.join(dir, name), name));
    if (hit) return path.join(dir, hit);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findNearestProject(filePath, lang) {
  const resolved = filePath || process.cwd();
  const start = fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? path.dirname(resolved) : resolved;
  const cfg = LANG_CONFIG[lang];
  if (!cfg || !cfg.projectFiles) return null;
  return findUp(start, (full, name) => cfg.projectFiles.test(name) && fs.statSync(full).isFile());
}

function hasCli(cmd, args) {
  if (!cmd) return false;
  const bin = process.platform === 'win32' && cmd !== 'cargo' ? cmd + '.exe' : cmd;
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 5000 });
  return r.status === 0;
}

function runCli(cmd, args, options = {}) {
  const bin = process.platform === 'win32' && cmd !== 'cargo' ? cmd + '.exe' : cmd;
  return spawnSync(bin, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout || 120000,
    cwd: options.cwd || process.cwd(),
  });
}

function getAllConfigFiles() {
  const all = new Set();
  for (const cfg of Object.values(LANG_CONFIG)) {
    if (cfg.configFiles) for (const f of cfg.configFiles) all.add(f);
  }
  return all;
}

function getAllDebugPatterns() {
  const patterns = [];
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    if (cfg.debugPatterns) {
      for (const re of cfg.debugPatterns) {
        patterns.push({ re, lang });
      }
    }
  }
  return patterns;
}

function getAllCommitBlockers() {
  const blockers = [];
  for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
    if (cfg.commitBlockers) {
      for (const b of cfg.commitBlockers) {
        blockers.push({ ...b, lang });
      }
    }
  }
  return blockers;
}

module.exports = {
  LANG_CONFIG,
  accumulatorPath,
  appendAccumulatedFile,
  detectLang,
  findNearestProject,
  findUp,
  getAllCommitBlockers,
  getAllConfigFiles,
  getAllDebugPatterns,
  hasCli,
  isGeneratedOrBuildOutput,
  isLangFile,
  isTestPath,
  readAccumulatedFiles,
  runCli,
  sessionId,
};

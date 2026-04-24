// Shared helpers for .NET-specific Claude hooks.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DOTNET_EXT_RE = /\.(cs|csx|razor|cshtml|csproj|fsproj|vbproj|sln|props|targets|editorconfig)$/i;
const DOTNET_BASENAMES = new Set([
  'global.json',
  'NuGet.config',
  'Directory.Build.props',
  'Directory.Build.targets',
  'Directory.Packages.props',
  'packages.lock.json',
  'stylecop.json',
  'CodeAnalysis.ruleset',
]);

function sessionId() {
  return (process.env.CLAUDE_SESSION_ID || crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
}

function accumulatorPath() {
  return path.join(os.tmpdir(), `claude-dotnet-edited-${sessionId()}.txt`);
}

function isDotnetFile(filePath) {
  if (!filePath) return false;
  const base = path.basename(filePath);
  return DOTNET_EXT_RE.test(filePath) ||
    DOTNET_BASENAMES.has(base) ||
    /^appsettings(\.[^.]+)?\.json$/i.test(base) ||
    /\.ruleset$/i.test(base) ||
    /\.sln\.DotSettings$/i.test(base);
}

function isGeneratedOrBuildOutput(filePath) {
  return /(^|[\\/])(bin|obj)[\\/]/.test(filePath) || /\.(g|designer)\.cs$/i.test(filePath);
}

function isTestPath(filePath) {
  return /(^|[\\/])(test|tests|spec|specs)([\\/]|$)/i.test(filePath) ||
    /(?:test|tests|spec|specs)\.(cs|razor|cshtml)$/i.test(filePath) ||
    /[\\/][^\\/]*(?:Tests|Test|Specs|Spec)[\\/]/.test(filePath);
}

function readAccumulatedFiles({ clear = false } = {}) {
  const file = accumulatorPath();
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return [];
  }
  if (clear) {
    try { fs.unlinkSync(file); } catch (e) {}
  }
  return [...new Set(raw.split('\n').map(line => line.trim()).filter(Boolean))]
    .filter(filePath => fs.existsSync(filePath));
}

function appendAccumulatedFile(filePath) {
  if (isDotnetFile(filePath) && !isGeneratedOrBuildOutput(filePath)) {
    fs.appendFileSync(accumulatorPath(), filePath + '\n');
  }
}

function findUp(startDir, predicate) {
  let dir = path.resolve(startDir || process.cwd());
  while (true) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (e) {
      return null;
    }
    const hit = names.find(name => predicate(path.join(dir, name), name));
    if (hit) return path.join(dir, hit);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findNearestProjectOrSolution(filePath) {
  const resolved = filePath || process.cwd();
  const start = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  return findUp(start, (full, name) => /\.(sln|csproj|fsproj|vbproj)$/i.test(name) && fs.statSync(full).isFile());
}

function hasDotnetCli() {
  const r = spawnSync(process.platform === 'win32' ? 'dotnet.exe' : 'dotnet', ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return r.status === 0;
}

function runDotnet(args, options = {}) {
  return spawnSync(process.platform === 'win32' ? 'dotnet.exe' : 'dotnet', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout || 120000,
    cwd: options.cwd || process.cwd(),
  });
}

module.exports = {
  appendAccumulatedFile,
  findNearestProjectOrSolution,
  hasDotnetCli,
  isDotnetFile,
  isGeneratedOrBuildOutput,
  isTestPath,
  readAccumulatedFiles,
  runDotnet,
};

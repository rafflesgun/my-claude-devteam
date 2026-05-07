const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectLang, findNearestProject, hasCli, isGeneratedOrBuildOutput, isTestPath, LANG_CONFIG, runCli } = require('./lang-utils');

function editedFiles(input) {
  const files = [];
  if (input?.file_path) files.push(input.file_path);
  if (input?.filePath) files.push(input.filePath);
  if (Array.isArray(input?.edits))
    for (const e of input.edits) {
      if (e?.file_path) files.push(e.file_path);
      if (e?.filePath) files.push(e.filePath);
    }
  return files.filter(f => !isGeneratedOrBuildOutput(f) && !isTestPath(f));
}

function findJstsTestFile(fp) {
  const dir = path.dirname(fp);
  const base = path.basename(fp).replace(/\.(ts|tsx|js|jsx)$/, '');
  const candidates = [
    path.join(dir, `${base}.test.ts`), path.join(dir, `${base}.test.tsx`),
    path.join(dir, `${base}.test.js`), path.join(dir, `${base}.spec.ts`),
    path.join(dir, `${base}.spec.tsx`), path.join(dir, `${base}.spec.js`),
    path.join(dir, '__tests__', `${base}.test.ts`), path.join(dir, '__tests__', `${base}.test.tsx`),
  ];
  return candidates.find(f => fs.existsSync(f));
}

function findPythonTestFile(fp) {
  const dir = path.dirname(fp);
  const base = path.basename(fp).replace(/\.py$/, '');
  const candidates = [
    path.join(dir, 'test_' + base + '.py'),
    path.join(dir, base + '_test.py'),
    path.join(dir, 'tests', 'test_' + base + '.py'),
  ];
  return candidates.find(f => fs.existsSync(f));
}

function findDotnetTestProjects(root) {
  const out = [];
  function walk(dir) {
    if (/(^|[\\/])(bin|obj|node_modules|\.git)([\\/]|$)/.test(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && /\.(csproj|fsproj|vbproj)$/i.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (LANG_CONFIG.csharp.testFrameworks.test(text) ||
            LANG_CONFIG.csharp.testProjName.test(entry.name) ||
            /[\\/](Tests?|Specs?)[\\/]/i.test(full)) {
          out.push(full);
        }
      }
    }
  }
  walk(root);
  return out;
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);
    const files = editedFiles(i.tool_input);
    if (files.length === 0) { process.stdout.write(d); return; }

    const fp = files[0];
    const lang = detectLang(fp);
    if (!lang) { process.stdout.write(d); return; }

    if (lang === 'jsts') {
      const testFile = findJstsTestFile(fp);
      if (!testFile) { process.stdout.write(d); return; }
      const cwd = process.cwd();
      const isWin = process.platform === 'win32';
      const binDir = path.join(cwd, 'node_modules', '.bin');
      const vitestBin = path.join(binDir, isWin ? 'vitest.cmd' : 'vitest');
      const jestBin = path.join(binDir, isWin ? 'jest.cmd' : 'jest');
      let cmd, args;
      if (fs.existsSync(vitestBin)) { cmd = vitestBin; args = ['run', testFile, '--reporter=basic']; }
      else if (fs.existsSync(jestBin)) { cmd = jestBin; args = [testFile, '--no-coverage', '--silent']; }
      else { process.stdout.write(d); return; }
      const r = spawnSync(cmd, args, { shell: isWin, encoding: 'utf8', timeout: 60000, cwd });
      if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
        process.stderr.write(`[Hook] Tests failing in ${path.basename(testFile)}:\n${out}\n`);
      }
    } else if (lang === 'csharp') {
      if (!hasCli(LANG_CONFIG.csharp.cliCheck, LANG_CONFIG.csharp.cliCheckArgs)) { process.stdout.write(d); return; }
      const target = findNearestProject(fp, 'csharp') || findNearestProject(process.cwd(), 'csharp');
      const root = target ? path.dirname(target) : process.cwd();
      const tests = findDotnetTestProjects(root).slice(0, 2);
      if (tests.length === 0) { process.stdout.write(d); return; }
      const base = path.basename(fp, '.cs');
      for (const testProject of tests) {
        const r = runCli(LANG_CONFIG.csharp.testCmd, LANG_CONFIG.csharp.testArgs(testProject, base), { timeout: 120000 });
        if (r.status !== 0) {
          const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
          process.stderr.write(`[Hook] .NET tests reported failures in ${path.basename(testProject)}:\n${out}\n`);
        }
      }
    } else if (lang === 'python') {
      const testFile = findPythonTestFile(fp);
      if (!testFile) { process.stdout.write(d); return; }
      const r = spawnSync('python3', ['-m', 'pytest', testFile, '-q'], { encoding: 'utf8', timeout: 60000 });
      if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
        process.stderr.write(`[Hook] Python tests failing in ${path.basename(testFile)}:\n${out}\n`);
      }
    } else if (lang === 'rust') {
      if (!hasCli(LANG_CONFIG.rust.cliCheck, LANG_CONFIG.rust.cliCheckArgs)) { process.stdout.write(d); return; }
      const base = path.basename(fp, '.rs');
      const r = runCli(LANG_CONFIG.rust.testCmd, LANG_CONFIG.rust.testArgs(null, base), { timeout: 120000 });
      if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
        process.stderr.write(`[Hook] Rust tests failing:\n${out}\n`);
      }
    } else if (lang === 'go') {
      if (!hasCli(LANG_CONFIG.go.cliCheck, LANG_CONFIG.go.cliCheckArgs)) { process.stdout.write(d); return; }
      const r = runCli(LANG_CONFIG.go.testCmd, LANG_CONFIG.go.testArgs(), { timeout: 120000 });
      if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
        process.stderr.write(`[Hook] Go tests failing:\n${out}\n`);
      }
    }
  } catch (e) {}
  process.stdout.write(d);
});

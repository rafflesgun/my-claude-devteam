// PostToolUse on Write|Edit: best-effort related test execution for C# edits.
const fs = require('fs');
const path = require('path');
const { findNearestProjectOrSolution, hasDotnetCli, isGeneratedOrBuildOutput, runDotnet } = require('./dotnet-utils');

function editedFiles(input) {
  const files = [];
  if (input?.file_path) files.push(input.file_path);
  if (input?.filePath) files.push(input.filePath);
  if (Array.isArray(input?.edits)) {
    for (const e of input.edits) {
      if (e?.file_path) files.push(e.file_path);
      if (e?.filePath) files.push(e.filePath);
    }
  }
  return files.filter(file => /\.cs$/i.test(file) && !isGeneratedOrBuildOutput(file));
}

function shouldSkipDir(dir) {
  return /(^|[\\/])(bin|obj|node_modules|\.git)([\\/]|$)/.test(dir);
}

function findTestProjects(root) {
  const out = [];
  function walk(dir) {
    if (shouldSkipDir(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && /\.(csproj|fsproj|vbproj)$/i.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (/(xunit|NUnit|MSTest\.TestFramework|Microsoft\.NET\.Test\.Sdk)/i.test(text) ||
          /(Tests?|Specs?)\./.test(entry.name) || /[\\/](Tests?|Specs?)[\\/]/i.test(full)) {
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
    if (files.length === 0 || !hasDotnetCli()) { process.stdout.write(d); return; }

    const source = files[0];
    const target = findNearestProjectOrSolution(source) || findNearestProjectOrSolution(process.cwd());
    const root = target ? path.dirname(target) : process.cwd();
    const tests = findTestProjects(root).slice(0, 2);
    if (tests.length === 0) { process.stdout.write(d); return; }

    const base = path.basename(source, '.cs');
    for (const testProject of tests) {
      const r = runDotnet(['test', testProject, '--no-restore', '--filter', `FullyQualifiedName~${base}`], { timeout: 120000 });
      if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 30).join('\n');
        process.stderr.write(`[Hook] .NET tests reported failures in ${path.basename(testProject)}:\n${out}\n`);
      }
    }
  } catch (e) {}
  process.stdout.write(d);
});

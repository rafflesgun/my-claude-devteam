// Stop hook: warn on C# debug leftovers in modified files.
const fs = require('fs');
const { spawnSync } = require('child_process');
const { isGeneratedOrBuildOutput, isTestPath } = require('./dotnet-utils');

const patterns = [
  /\bConsole\.WriteLine\s*\(/,
  /\bDebug\.WriteLine\s*\(/,
  /\bTrace\.WriteLine\s*\(/,
  /\bDebugger\.(Break|Launch)\s*\(/,
];

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const r = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { encoding: 'utf8' });
    if (r.status !== 0) { process.stdout.write(d); return; }
    const files = r.stdout.trim().split('\n')
      .filter(file => /\.(cs|razor|cshtml)$/i.test(file) && fs.existsSync(file) && !isGeneratedOrBuildOutput(file) && !isTestPath(file));
    let found = false;
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const matches = [];
      lines.forEach((line, idx) => { if (patterns.some(p => p.test(line))) matches.push(idx + 1); });
      if (matches.length > 0) {
        process.stderr.write(`[Hook] .NET debug/log leftovers in ${file} (lines: ${matches.slice(0, 5).join(', ')})\n`);
        found = true;
      }
    }
    if (found) process.stderr.write('[Hook] Review C# debug/log leftovers before committing.\n');
  } catch (e) {}
  process.stdout.write(d);
});

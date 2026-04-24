// Stop hook: best-effort .NET format verification and build for edited .NET files.
const path = require('path');
const { findNearestProjectOrSolution, hasDotnetCli, readAccumulatedFiles, runDotnet } = require('./dotnet-utils');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const files = readAccumulatedFiles({ clear: true });
    if (files.length === 0) { process.stdout.write(d); return; }

    if (!hasDotnetCli()) {
      process.stderr.write('[Hook] .NET: dotnet CLI not found; skipping .NET format/build checks.\n');
      process.stdout.write(d);
      return;
    }

    const targets = [...new Set(files.map(file => findNearestProjectOrSolution(file)).filter(Boolean))];
    if (targets.length === 0) {
      const rootTarget = findNearestProjectOrSolution(process.cwd());
      if (rootTarget) targets.push(rootTarget);
    }
    if (targets.length === 0) { process.stdout.write(d); return; }

    for (const target of targets) {
      const format = runDotnet(['format', target, '--verify-no-changes', '--no-restore', '--verbosity', 'minimal'], { timeout: 120000 });
      if (format.status !== 0) {
        const out = ((format.stdout || '') + (format.stderr || '')).split('\n').slice(0, 25).join('\n');
        process.stderr.write(`[Hook] .NET format check failed for ${path.basename(target)}:\n${out}\n`);
      }

      const build = runDotnet(['build', target, '--no-restore'], { timeout: 180000 });
      if (build.status !== 0) {
        const out = ((build.stdout || '') + (build.stderr || '')).split('\n').slice(0, 35).join('\n');
        process.stderr.write(`[Hook] .NET build failed for ${path.basename(target)}. If assets are missing, run dotnet restore first.\n${out}\n`);
      }
    }
  } catch (e) {}
  process.stdout.write(d);
});

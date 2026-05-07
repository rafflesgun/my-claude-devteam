const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readAccumulatedFiles, findNearestProject, hasCli, runCli, LANG_CONFIG } = require('./lang-utils');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const isWin = process.platform === 'win32';

    for (const [lang, cfg] of Object.entries(LANG_CONFIG)) {
      const files = readAccumulatedFiles(lang, { clear: true });
      if (files.length === 0) continue;

      if (lang === 'jsts') {
        const extRe = /\.(ts|tsx|js|jsx)$/;
        const jstsFiles = files.filter(f => extRe.test(f) && fs.existsSync(f));
        if (jstsFiles.length === 0) continue;

        const prettierBin = path.join(process.cwd(), 'node_modules', '.bin', isWin ? 'prettier.cmd' : 'prettier');
        if (fs.existsSync(prettierBin)) {
          try { spawnSync(prettierBin, ['--write', ...jstsFiles], { shell: isWin, stdio: 'pipe', timeout: 60000 }); } catch (e) {}
        }

        const tsFiles = jstsFiles.filter(f => /\.(ts|tsx)$/.test(f));
        if (tsFiles.length > 0) {
          try {
            const npx = isWin ? 'npx.cmd' : 'npx';
            const r = spawnSync(npx, ['tsc', '--noEmit', '--pretty', 'false'], {
              shell: isWin, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000
            });
            if (r.status !== 0) {
              const lines = ((r.stdout || '') + (r.stderr || '')).split('\n');
              for (const f of tsFiles) {
                const rel = path.relative(process.cwd(), f);
                const relevant = lines.filter(l => l.includes(f) || l.includes(rel)).slice(0, 3);
                if (relevant.length > 0) {
                  process.stderr.write(`[Hook] TS errors in ${path.basename(f)}:\n`);
                  relevant.forEach(l => process.stderr.write(l + '\n'));
                }
              }
            }
          } catch (e) {}
        }
      } else if (lang === 'csharp') {
        if (!hasCli(cfg.cliCheck, cfg.cliCheckArgs)) {
          process.stderr.write('[Hook] .NET: dotnet CLI not found; skipping .NET format/build checks.\n');
          continue;
        }
        const targets = [...new Set(files.map(f => findNearestProject(f, 'csharp')).filter(Boolean))];
        if (targets.length === 0) {
          const rootTarget = findNearestProject(process.cwd(), 'csharp');
          if (rootTarget) targets.push(rootTarget);
        }
        for (const target of targets) {
          const format = runCli(cfg.formatCmd, cfg.formatArgs(target), { timeout: 120000 });
          if (format.status !== 0) {
            const out = ((format.stdout || '') + (format.stderr || '')).split('\n').slice(0, 25).join('\n');
            process.stderr.write(`[Hook] .NET format check failed for ${path.basename(target)}:\n${out}\n`);
          }
          const build = runCli(cfg.buildCmd, cfg.buildArgs(target), { timeout: 180000 });
          if (build.status !== 0) {
            const out = ((build.stdout || '') + (build.stderr || '')).split('\n').slice(0, 35).join('\n');
            process.stderr.write(`[Hook] .NET build failed for ${path.basename(target)}. If assets are missing, run dotnet restore first.\n${out}\n`);
          }
        }
      } else if (lang === 'rust') {
        if (!hasCli(cfg.cliCheck, cfg.cliCheckArgs)) continue;
        const r = runCli(cfg.formatCmd, cfg.formatArgs());
        if (r.status !== 0) {
          process.stderr.write('[Hook] Rust: cargo fmt --check found unformatted code.\n');
        }
        const b = runCli(cfg.buildCmd, cfg.buildArgs());
        if (b.status !== 0) {
          const out = ((b.stdout || '') + (b.stderr || '')).split('\n').slice(0, 25).join('\n');
          process.stderr.write(`[Hook] Rust: cargo check failed:\n${out}\n`);
        }
      } else if (lang === 'go') {
        if (!hasCli(cfg.cliCheck, cfg.cliCheckArgs)) continue;
        const r = runCli(cfg.formatCmd, cfg.formatArgs());
        if (r.status !== 0) {
          const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 15).join('\n');
          process.stderr.write(`[Hook] Go: go fmt found issues:\n${out}\n`);
        }
      } else if (lang === 'python') {
        const hasRuff = hasCli('ruff', ['--version']);
        if (hasRuff) {
          const r = runCli('ruff', ['check', '--select', 'E,F,W', ...files], { timeout: 60000 });
          if (r.status !== 0) {
            const out = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(0, 25).join('\n');
            process.stderr.write(`[Hook] Python: ruff check found issues:\n${out}\n`);
          }
        }
      }
    }
  } catch (e) {}
  process.stdout.write(d);
});

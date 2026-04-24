// PreToolUse on Bash/git commit: block high-confidence .NET debug breakpoints and secrets in staged files.
const { spawnSync } = require('child_process');
const { isDotnetFile } = require('./dotnet-utils');

const blockers = [
  { re: /\bDebugger\.(Break|Launch)\s*\(/, label: 'Debugger breakpoint/launcher' },
  { re: /\bSystem\.Diagnostics\.Debugger\.(Break|Launch)\s*\(/, label: 'Debugger breakpoint/launcher' },
  { re: /(Server|Data Source)\s*=.+;\s*(Database|Initial Catalog)\s*=.+;.+Password\s*=\s*[^;\s]+/i, label: 'connection string with password' },
  { re: /AccountKey\s*=\s*[A-Za-z0-9+/=]{40,}/i, label: 'Azure Storage account key' },
  { re: /(Jwt|Token|SigningKey|IssuerSigningKey)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{32,}["']/i, label: 'JWT/token signing secret' },
  { re: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, label: 'private key material' },
];

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);
    const cmd = i.tool_input?.command || '';
    if (!/git\s+commit\b/.test(cmd) || /--amend/.test(cmd)) { process.stdout.write(d); return; }

    const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
    const files = (r.stdout || '').trim().split('\n').filter(Boolean).filter(isDotnetFile);
    let blocked = false;

    for (const file of files) {
      const staged = spawnSync('git', ['show', ':' + file], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const content = staged.stdout || '';
      for (const rule of blockers) {
        if (rule.re.test(content)) {
          process.stderr.write(`[Hook] ERROR: ${rule.label} in ${file}\n`);
          blocked = true;
        }
      }
    }

    if (blocked) {
      process.stderr.write('[Hook] .NET commit blocked. Fix issues above.\n');
      process.exit(2);
    }
  } catch (e) {}
  process.stdout.write(d);
});

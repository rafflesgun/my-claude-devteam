const { spawnSync } = require('child_process');
const { detectLang, getAllCommitBlockers, isGeneratedOrBuildOutput } = require('./lang-utils');

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /AKIA[A-Z0-9]{16}/,
  /AIza[a-zA-Z0-9_-]{35}/,
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
];

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);
    const cmd = i.tool_input?.command || '';
    if (!/git\s+commit\b/.test(cmd) || /--amend/.test(cmd)) { process.stdout.write(d); return; }

    const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
    const files = (r.stdout || '').trim().split('\n').filter(Boolean).filter(f => !isGeneratedOrBuildOutput(f));
    let blocked = false;

    for (const f of files) {
      const lang = detectLang(f);
      if (!lang) continue;
      const cr = spawnSync('git', ['show', ':' + f], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const c = cr.stdout || '';

      for (const blocker of getAllCommitBlockers()) {
        if (blocker.lang !== lang) continue;
        if (blocker.re.test(c)) {
          process.stderr.write(`[Hook] ERROR: ${blocker.label} in ${f}\n`);
          blocked = true;
        }
      }

      for (const p of SECRET_PATTERNS) {
        if (p.test(c)) {
          process.stderr.write(`[Hook] ERROR: potential secret in ${f}\n`);
          blocked = true;
        }
      }
    }

    if (blocked) {
      process.stderr.write('[Hook] Commit blocked. Fix issues above.\n');
      process.exit(2);
    }
  } catch (e) {}
  process.stdout.write(d);
});

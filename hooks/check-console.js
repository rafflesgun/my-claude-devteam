const { spawnSync } = require('child_process');
const fs = require('fs');
const { detectLang, getAllDebugPatterns, isGeneratedOrBuildOutput, isTestPath } = require('./lang-utils');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const r = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { encoding: 'utf8' });
    if (r.status !== 0) { process.stdout.write(d); return; }

    const allPatterns = getAllDebugPatterns();
    const files = r.stdout.trim().split('\n')
      .filter(f => f && !isGeneratedOrBuildOutput(f) && !isTestPath(f) && fs.existsSync(f));

    const langMessages = {};
    for (const file of files) {
      const lang = detectLang(file);
      if (!lang) continue;
      const relevant = allPatterns.filter(p => p.lang === lang);
      if (relevant.length === 0) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const matches = [];
      lines.forEach((line, idx) => {
        if (relevant.some(p => p.re.test(line))) matches.push(idx + 1);
      });
      if (matches.length > 0) {
        const label = lang === 'jsts' ? 'console.log' : `${lang} debug/log`;
        process.stderr.write(`[Hook] ${label} leftover in ${file} (lines: ${matches.slice(0, 5).join(', ')})\n`);
        langMessages[lang] = true;
      }
    }
    if (Object.keys(langMessages).length > 0) {
      const langs = Object.keys(langMessages).join(', ');
      process.stderr.write(`[Hook] Review debug/log leftovers before committing (${langs}).\n`);
    }
  } catch (e) {}
  process.stdout.write(d);
});

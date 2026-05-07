const path = require('path');
const { detectLang, getAllConfigFiles } = require('./lang-utils');

const allProtected = getAllConfigFiles();

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    if (process.env.CLAUDE_ALLOW_CONFIG_EDIT === '1') {
      process.stdout.write(d);
      return;
    }
    const i = JSON.parse(d);
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (i.tool_input?.filePath) files.push(i.tool_input.filePath);
    if (Array.isArray(i.tool_input?.edits))
      for (const e of i.tool_input.edits) {
        if (e?.file_path) files.push(e.file_path);
        if (e?.filePath) files.push(e.filePath);
      }
    const hit = files.find(fp => {
      const bn = path.basename(fp);
      return allProtected.has(bn);
    });
    if (hit) {
      process.stderr.write(`[Hook] BLOCKED: Modifying ${path.basename(hit)} is not allowed unless the user explicitly requested config changes. Set CLAUDE_ALLOW_CONFIG_EDIT=1 for that session, or fix source code instead.\n`);
      process.exit(2);
    }
  } catch (e) {}
  process.stdout.write(d);
});

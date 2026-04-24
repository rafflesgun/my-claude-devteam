// PreToolUse on Write|Edit: protect .NET quality/build/package config from casual weakening.
const path = require('path');

const protectedNames = new Set([
  '.editorconfig',
  'Directory.Build.props',
  'Directory.Build.targets',
  'Directory.Packages.props',
  'global.json',
  'NuGet.config',
  'packages.lock.json',
  'stylecop.json',
  'CodeAnalysis.ruleset',
]);

function protectedConfig(filePath) {
  const base = path.basename(filePath || '');
  return protectedNames.has(base) || /\.ruleset$/i.test(base) || /\.sln\.DotSettings$/i.test(base);
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    if (process.env.CLAUDE_ALLOW_DOTNET_CONFIG_EDIT === '1') {
      process.stdout.write(d);
      return;
    }
    const i = JSON.parse(d);
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (i.tool_input?.filePath) files.push(i.tool_input.filePath);
    if (Array.isArray(i.tool_input?.edits)) {
      for (const e of i.tool_input.edits) {
        if (e?.file_path) files.push(e.file_path);
        if (e?.filePath) files.push(e.filePath);
      }
    }
    const hit = files.find(protectedConfig);
    if (hit) {
      process.stderr.write(`[Hook] BLOCKED: Modifying ${path.basename(hit)} is not allowed unless the user explicitly requested .NET build/analyzer/package configuration changes. Set CLAUDE_ALLOW_DOTNET_CONFIG_EDIT=1 for that session, or fix source code instead of weakening rules.\n`);
      process.exit(2);
    }
  } catch (e) {}
  process.stdout.write(d);
});

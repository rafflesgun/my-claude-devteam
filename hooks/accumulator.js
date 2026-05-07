const { appendAccumulatedFile } = require('./lang-utils');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const i = JSON.parse(d);
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (i.tool_input?.filePath) files.push(i.tool_input.filePath);
    if (Array.isArray(i.tool_input?.edits))
      for (const e of i.tool_input.edits) {
        if (e?.file_path) files.push(e.file_path);
        if (e?.filePath) files.push(e.filePath);
      }
    for (const file of files) appendAccumulatedFile(file);
  } catch (e) {}
  process.stdout.write(d);
});

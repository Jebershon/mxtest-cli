function extract(rawOutput) {
  if (!rawOutput) return [];
  const out = [];
  const regex = /```javascript\s*([\s\S]*?)\s*```/g;
  let match;
  let idx = 0;
  while ((match = regex.exec(rawOutput)) !== null) {
    const block = (match[1] || '').trim();
    if (!block) continue;
    const lines = block.split(/\r?\n/);
    let filename = null;
    if (lines.length > 0) {
      const first = lines[0].trim();
      const fileMatch = first.match(/^\/\/\s*FILE:\s*(\S+)$/i);
      if (fileMatch) {
        filename = fileMatch[1].trim();
        lines.shift();
      }
    }
    const code = lines.join('\n').trim();
    if (!code) continue;
    if (!filename) filename = `generated-${++idx}.spec.js`;
    out.push({ filename, code });
  }
  return out;
}

module.exports = { extract };

const fs = require('fs-extra');
const path = require('path');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function build(results, outputDir) {
  await fs.ensureDir(outputDir);
  const outFile = path.join(outputDir, 'report.html');
  const rows = [];

  const summary = results || {};
  const tests = summary.suites || [];

  // Flatten tests
  const flat = [];
  function walkSuite(s) {
    if (s.tests) s.tests.forEach(t => flat.push(t));
    if (s.suites) s.suites.forEach(walkSuite);
  }
  if (Array.isArray(tests)) tests.forEach(walkSuite);

  for (const t of flat) {
    rows.push(`<tr>
      <td>${escapeHtml(t.file || '')}</td>
      <td>${escapeHtml(t.title || t.title)}</td>
      <td>${escapeHtml(t.status || '')}</td>
      <td>${escapeHtml((t.duration || 0) + 'ms')}</td>
      <td><pre>${escapeHtml(t.error || '')}</pre></td>
    </tr>`);
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>mxtest report</title>
  <style>
    body{font-family: Arial, Helvetica, sans-serif;padding:20px}
    .ok{color:green}.fail{color:red}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:8px}
    pre{white-space:pre-wrap}
  </style>
</head>
<body>
  <h1>mxtest report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <table>
    <thead><tr><th>File</th><th>Test</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>
      ${rows.join('\n')}
    </tbody>
  </table>
</body>
</html>`;

  await fs.writeFile(outFile, html, 'utf8');
  return outFile;
}

module.exports = { build };

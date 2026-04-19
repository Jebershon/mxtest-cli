const fs = require('fs-extra');
const path = require('path');
const ExcelJS = require('exceljs');

async function buildHTML(projectContext, generatedFiles, testResults, outputPath) {
  // outputPath is the full path to report.html
  const version = (function() {
    try { const pkg = require(path.join(process.cwd(), 'package.json')); return pkg.version || '1.0.0'; } catch (e) { return '1.0.0'; }
  })();
  const projectName = projectContext.projectName || 'Project';
  const appUrl = projectContext.appUrl || 'http://localhost:8080';
  const ts = new Date().toISOString();
  const totalTests = (testResults && (testResults.totalPassed+testResults.totalFailed+testResults.totalSkipped)) || 0;
  const passed = testResults.totalPassed || 0;
  const failed = testResults.totalFailed || 0;
  const skipped = testResults.totalSkipped || 0;
  const passRate = totalTests ? Math.round((passed / totalTests) * 100) : 100;

  // Build SVG donut
  const donut = (() => {
    const size = 160; const cx = size/2; const cy = size/2; const r = 60; const c = 2*Math.PI*r;
    const passLen = (passed/Math.max(1,totalTests))*c;
    const failLen = (failed/Math.max(1,totalTests))*c;
    const skipLen = (skipped/Math.max(1,totalTests))*c;
    const passOffset = 0;
    const failOffset = passLen;
    const skipOffset = passLen + failLen;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="20" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#22c55e" stroke-width="20" stroke-dasharray="${passLen} ${c-passLen}" stroke-dashoffset="-${passOffset}" transform="rotate(-90 ${cx} ${cy})" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ef4444" stroke-width="20" stroke-dasharray="${failLen} ${c-failLen}" stroke-dashoffset="-${failOffset}" transform="rotate(-90 ${cx} ${cy})" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#9ca3af" stroke-width="20" stroke-dasharray="${skipLen} ${c-skipLen}" stroke-dashoffset="-${skipOffset}" transform="rotate(-90 ${cx} ${cy})" />
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20" fill="#0f172a">${passRate}%</text>
    </svg>`;
  })();

  // Build bars
  const barSvg = (() => {
    const files = generatedFiles || [];
    const maxCount = Math.max(1, ...files.map(f => (f.testCount||1)));
    const width = 400; const height = 160; const barW = Math.max(20, Math.floor(width / Math.max(1, files.length)));
    let x = 0; const bars = [];
    files.forEach((f, i) => {
      const count = f.testCount || 1; const h = Math.round((count/maxCount) * (height-40));
      const passedH = Math.round(h * ((f.passed || 0) / Math.max(1, (f.passed||0)+(f.failed||0)+(f.skipped||0))));
      const failedH = Math.round(h * ((f.failed || 0) / Math.max(1, (f.passed||0)+(f.failed||0)+(f.skipped||0))));
      const y = height - h - 10;
      let innerY = height - 10 - passedH;
      bars.push(`<g><rect x="${x+4}" y="${y}" width="${barW-8}" height="${h}" fill="#1e293b66"/></g>`);
      bars.push(`<rect x="${x+4}" y="${innerY}" width="${barW-8}" height="${passedH}" fill="#22c55e"/>`);
      bars.push(`<rect x="${x+4}" y="${innerY-passedH}" width="${barW-8}" height="${failedH}" fill="#ef4444"/>`);
      x += barW;
    });
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars.join('\n')}</svg>`;
  })();

  // Build generated files table rows
  const genRows = (generatedFiles || []).map((f, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(f.filename)}</td>
      <td>${(f.pagesCovered||[]).join(', ')}</td>
      <td><span class="pill ${f.status==='generated'?'gen':'skip'}">${f.status}</span></td>
    </tr>
  `).join('\n');

  const testRows = (testResults.tests || []).map((t, idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(t.filename || '')}</td>
      <td>${escapeHtml(t.name || '')}</td>
      <td class="status-${t.status}">${t.status}</td>
      <td>${t.duration || ''}</td>
      <td class="err" data-full="${escapeHtml(t.error || '')}">${escapeHtml(truncate(t.error || '', 60))}${t.error?'<button class="exp">[+]</button>':''}</td>
    </tr>
  `).join('\n');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>mxtest Generate Report - ${escapeHtml(projectName)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a}
    .header{background:#0f172a;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
    .cards{display:flex;gap:12px;padding:12px}
    .card{background:#fff;padding:12px;border-radius:6px;flex:1;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
    .pill.gen{background:#dcfce7;padding:4px 8px;border-radius:999px}
    .pill.skip{background:#fef9c3;padding:4px 8px;border-radius:999px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:8px;border-bottom:1px solid #e6edf3}
    .status-passed{color:#16a34a}
    .status-failed{color:#dc2626}
    .status-skipped{color:#b45309}
    .err{max-width:400px}
    button.exp{margin-left:6px}
  </style>
</head>
<body>
  <div class="header"><div>mxtest — v${version}</div><div>${escapeHtml(projectName)}</div><div>${ts} • ${escapeHtml(appUrl)}</div></div>
  <div class="cards">
    <div class="card">Total Tests<br><strong>${totalTests}</strong></div>
    <div class="card">✔ Passed<br><strong>${passed}</strong></div>
    <div class="card">✗ Failed<br><strong>${failed}</strong></div>
    <div class="card">⚠ Skipped<br><strong>${skipped}</strong></div>
  </div>
  <div style="display:flex;gap:18px;padding:12px">
    <div>${donut}</div>
    <div>${barSvg}</div>
  </div>
  <section style="padding:12px">
    <h3>Generated Test Files</h3>
    <table>
      <thead><tr><th>#</th><th>Filename</th><th>Page Covered</th><th>Status</th></tr></thead>
      <tbody>${genRows}</tbody>
    </table>
  </section>
  <section style="padding:12px">
    <h3>Test Execution Results</h3>
    <table>
      <thead><tr><th>#</th><th>File</th><th>Test Name</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
      <tbody>${testRows}</tbody>
    </table>
  </section>
  <footer style="padding:12px;background:#f8fafc">mxtest v${version} — Report generated by mxtest generate testcase • <a href="${path.basename(outputPath)}">Open Excel Report</a></footer>
  <script>
    document.querySelectorAll('button.exp').forEach(b => b.addEventListener('click',(e)=>{
      const td = e.target.parentElement;
      const full = td.getAttribute('data-full');
      if (td.innerText.includes('[+]')) td.innerText = full; else td.innerText = full.substring(0,60)+'...';
    }));
  </script>
</body>
</html>`;

  await fs.writeFile(outputPath, html, 'utf8');
}

function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\' : '&#39;' }[c])); }
function truncate(s, n){ if(!s) return ''; return s.length>n? s.slice(0,n)+'...':s; }

async function buildExcel(projectContext, generatedFiles, testResults, outputPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test Report');
  // Title row
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `mxtest — Test Report — ${projectContext.projectName || ''} — ${new Date().toISOString()}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern:'solid', fgColor: { argb: 'FF0F172A' } };
  // Spacer
  // Summary label
  ws.getCell('A3').value = 'SUMMARY'; ws.getCell('A3').font = { bold: true, size: 11 };
  const total = (testResults.totalPassed||0) + (testResults.totalFailed||0) + (testResults.totalSkipped||0);
  ws.getCell('A4').value = 'Total Tests'; ws.getCell('B4').value = total;
  ws.getCell('A5').value = 'Passed'; ws.getCell('B5').value = testResults.totalPassed||0; ws.getCell('B5').fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFDCFCE7'} };
  ws.getCell('A6').value = 'Failed'; ws.getCell('B6').value = testResults.totalFailed||0; ws.getCell('B6').fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFfee2e2'} };
  ws.getCell('A7').value = 'Skipped'; ws.getCell('B7').value = testResults.totalSkipped||0; ws.getCell('B7').fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFef9c3'} };
  // Generated files header
  const startRow = 10;
  ws.getCell(`A${startRow}`).value = '#'; ws.getCell(`B${startRow}`).value = 'Filename'; ws.getCell(`C${startRow}`).value = 'Page Covered'; ws.getCell(`D${startRow}`).value = 'Status'; ws.getCell(`E${startRow}`).value = 'Generated At';
  ws.getRow(startRow).font = { bold: true }; ws.getRow(startRow).eachCell(c=>{ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1e293b'} }; c.font = { color:{argb:'FFFFFFFF'}, bold:true }; });
  let r = startRow+1;
  for (let i=0;i<generatedFiles.length;i++){
    const f = generatedFiles[i];
    ws.getCell(`A${r}`).value = i+1;
    ws.getCell(`B${r}`).value = f.filename;
    ws.getCell(`C${r}`).value = (f.pagesCovered||[]).join(', ');
    ws.getCell(`D${r}`).value = f.status;
    ws.getCell(`E${r}`).value = new Date().toISOString();
    if (f.status==='generated') ws.getCell(`D${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFDCFCE7'} };
    else ws.getCell(`D${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFef9c3'} };
    r++;
  }

  r += 1;
  const resLabelRow = r; ws.getCell(`A${resLabelRow}`).value = 'TEST EXECUTION RESULTS'; ws.getCell(`A${resLabelRow}`).font = { bold:true };
  r++;
  ws.getCell(`A${r}`).value = '#'; ws.getCell(`B${r}`).value = 'Spec File'; ws.getCell(`C${r}`).value = 'Test Name'; ws.getCell(`D${r}`).value = 'Status'; ws.getCell(`E${r}`).value = 'Duration'; ws.getCell(`F${r}`).value = 'Error';
  ws.getRow(r).font = { bold:true }; ws.getRow(r).eachCell(c=>{ c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1e293b'} }; c.font = { color:{argb:'FFFFFFFF'}, bold:true }; });
  r++;
  let idx = 1;
  for (const t of (testResults.tests || [])){
    ws.getCell(`A${r}`).value = idx++;
    ws.getCell(`B${r}`).value = t.filename || '';
    ws.getCell(`C${r}`).value = t.name || '';
    ws.getCell(`D${r}`).value = t.status || '';
    ws.getCell(`E${r}`).value = t.duration || '';
    ws.getCell(`F${r}`).value = t.error || '';
    if (t.status==='passed') ws.getCell(`D${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFDCFCE7'} };
    if (t.status==='failed') ws.getCell(`D${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFfee2e2'} };
    if (t.status==='skipped') ws.getCell(`D${r}`).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFef9c3'} };
    r++;
  }

  // Column widths
  ws.columns = [ {width:5},{width:30},{width:40},{width:12},{width:12},{width:60} ];
  // Apply basic borders and font
  ws.eachRow({ includeEmpty: false }, function(row, rowNumber) {
    row.eachCell(function(cell){ cell.font = { name:'Calibri', size:10 }; cell.alignment = { vertical:'middle'}; cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }; });
  });

  await wb.xlsx.writeFile(outputPath);
}

module.exports = { buildHTML, buildExcel };

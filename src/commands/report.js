const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');

module.exports = async function reportCmd() {
  try {
    const cfg = await configManager.readConfig().catch(() => ({}));
    const base = path.join(process.cwd(), cfg.reportDir || '.mxtest/test-results');
    const alt = path.join(process.cwd(), 'test-results');
    const dir = await fs.pathExists(base) ? base : (await fs.pathExists(alt) ? alt : null);
    if (!dir) {
      logger.error('No report directory found. Run tests first.');
      process.exit(1);
    }

    const items = (await fs.readdir(dir)).map(n => ({ name: n, full: path.join(dir, n) }));
    if (!items.length) {
      logger.error('No report entries found in ' + dir);
      process.exit(1);
    }
    // pick latest modified directory/file
    let latest = null; let latestM = 0;
    for (const it of items) {
      const stat = await fs.stat(it.full);
      if (stat.mtimeMs > latestM) { latest = it; latestM = stat.mtimeMs; }
    }
    if (!latest) {
      logger.error('Could not locate latest report');
      process.exit(1);
    }
    const indexFile = path.join(latest.full, 'index.html');
    const htmlFile = path.join(latest.full, 'report.html');
    const toOpen = (await fs.pathExists(indexFile)) ? indexFile : (await fs.pathExists(htmlFile) ? htmlFile : null);
    if (!toOpen) {
      logger.error('No HTML report found in latest report folder: ' + latest.full);
      process.exit(1);
    }

    // open file platform-safe
    if (process.platform === 'win32') {
      const safe = String(toOpen).replace(/"/g, '\\"');
      await execa.command(`cmd /c start "" /B "${safe}"`, { shell: true, windowsHide: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      await execa('open', [toOpen], { stdio: 'ignore' });
    } else {
      await execa('xdg-open', [toOpen], { stdio: 'ignore' });
    }
    logger.info('Opened report: ' + toOpen);
  } catch (err) {
    logger.error('report command failed: ' + String(err));
    process.exit(1);
  }
};

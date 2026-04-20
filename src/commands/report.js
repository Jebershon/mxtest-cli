const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const inquirer = require('inquirer');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const ui = require('../utils/ui');

module.exports = async function reportCmd() {
  try {
    ui.banner('mxtest — report', 'Opening test report');

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

    // Sort by modification time, newest first
    const itemsWithTime = await Promise.all(
      items.map(async (it) => {
        const stat = await fs.stat(it.full);
        return { ...it, mtime: stat.mtimeMs };
      })
    );
    itemsWithTime.sort((a, b) => b.mtime - a.mtime);

    let selectedItem;
    if (itemsWithTime.length === 1) {
      selectedItem = itemsWithTime[0];
    } else {
      // Prompt user to select report if multiple exist
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'report',
          message: 'Select a report to open',
          choices: itemsWithTime.map((it) => ({
            name: `${it.name} (${new Date(it.mtime).toLocaleString()})`,
            value: it,
          })),
        },
      ]);
      selectedItem = answer.report;
    }

    const indexFile = path.join(selectedItem.full, 'index.html');
    const htmlFile = path.join(selectedItem.full, 'report.html');
    const toOpen = (await fs.pathExists(indexFile)) ? indexFile : (await fs.pathExists(htmlFile) ? htmlFile : null);
    if (!toOpen) {
      logger.error('No HTML report found in report folder: ' + selectedItem.full);
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

const fs = require('fs-extra');
const path = require('path');
const ora = require('ora');
const logger = require('../utils/logger');
const validator = require('../utils/validator');
const configManager = require('../utils/configManager');

module.exports = async function init() {
  try {
    // run doctor checks
    const mx = await validator.checkMxcli();
    if (!mx.ok) {
      logger.error('mxcli missing: ' + mx.message);
      process.exit(1);
    }

    const mpr = await validator.checkMprFile();
    if (!mpr.ok) {
      logger.error('No .mpr found: ' + mpr.message);
      process.exit(1);
    }

    const cfg = await configManager.readConfig();

    // ensure tests dir
    const testsDir = path.resolve(process.cwd(), cfg.testDir || './tests');
    if (!await fs.pathExists(testsDir)) {
      const spin = ora(`Creating tests directory at ${testsDir}`).start();
      await fs.mkdirp(testsDir);
      spin.succeed('Created tests directory');
      logger.success(`Created ${testsDir}`);
    } else {
      logger.info(`Tests directory already exists: ${testsDir}`);
    }

    // create sample.spec.js
    const sampleSrc = path.join(__dirname, '..', 'templates', 'sample.spec.js.txt');
    const sampleDest = path.join(testsDir, 'sample.spec.js');
    if (!await fs.pathExists(sampleDest)) {
      const spin = ora('Creating sample.spec.js').start();
      const content = await fs.readFile(sampleSrc, 'utf8');
      await fs.writeFile(sampleDest, content, 'utf8');
      spin.succeed('Created sample.spec.js');
      logger.success(`Created ${sampleDest}`);
    } else {
      logger.info('sample.spec.js already exists, skipping');
    }

    // update config with mprFile
    if (!cfg.mprFile) {
      await configManager.updateConfig({ mprFile: mpr.file });
      logger.success('Saved mprFile to config');
    } else {
      logger.info('mxtest.config.json already contains mprFile');
    }

    logger.box('Initialization complete', { borderColor: 'green' });
  } catch (err) {
    logger.error('Init failed: ' + String(err));
    process.exit(1);
  }
};
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

module.exports = async () => {
  const testDir = path.join(process.cwd(), 'tests');

  if (fs.existsSync(testDir)) {
    console.log(chalk.yellow('Tests folder already exists'));
    return;
  }

  await fs.mkdir(testDir);

  const sampleTest = `
import { test, expect } from '@playwright/test';

test('App loads', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await expect(page).toHaveTitle(/Mendix/i);
});
`;

  await fs.writeFile(
    path.join(testDir, 'sample.spec.js'),
    sampleTest
  );

  console.log(chalk.green('✔ Initialized tests folder'));
};
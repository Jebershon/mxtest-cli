const path = require('path');
const logger = require('../utils/logger');
const autoDetect = require('../utils/autoDetect');
const { runPlaywrightCmd } = require('../utils/playwrightHelper');

module.exports = async function recordCmd(opts = {}) {
  try {
    const cwd = process.cwd();
    const { auto } = await autoDetect.ensureTestDirs(cwd);
    const url = await autoDetect.detectAppUrl({ cwd });
    const fname = `record-${Date.now()}.spec.js`;
    const outFile = path.join(auto, fname);
    logger.info('Launching Playwright recorder for: ' + url);
    await runPlaywrightCmd(['codegen', url, '--output', outFile], { cwd, env: { APP_URL: url } });
    logger.success('Recording saved to: ' + outFile);
  } catch (err) {
    logger.error('Record failed: ' + String(err));
    process.exit(1);
  }
};
const path = require('path');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');

module.exports = async function down() {
  try {
    const cfg = await configManager.readConfig();
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    // `mxtest run` now performs a compose down before starting a fresh stack.
    // Keep `mxtest down` as a no-op informational command to avoid duplicate
    // down operations that may interfere with the run workflow.
    logger.info('mxtest run will stop any existing stack before starting a new one.');
    logger.info('If you need to stop compose manually, run:');
    logger.info(`  (cd ${dockerDir} && docker compose down -v` + ')');
  } catch (err) {
    logger.error('Down failed: ' + String(err));
    process.exit(1);
  }
};

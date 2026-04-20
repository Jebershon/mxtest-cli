const path = require('path');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const dockerHelper = require('../utils/dockerHelper');

module.exports = async function down() {
  try {
    const cfg = await configManager.readConfig();
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');

    // If Docker is not reachable on Windows, try to start Docker Desktop
    try {
      await execa('docker', ['info']);
    } catch (err) {
      try {
        const started = await dockerHelper.startDockerDesktopIfWindows(err);
        if (started) logger.info('Attempted to start Docker Desktop; wait a moment and retry your `mxtest` command.');
      } catch (e) {
        logger.warn('Could not auto-start Docker Desktop: ' + String(e));
      }
    }
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

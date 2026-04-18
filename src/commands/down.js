const path = require('path');
const { execa } = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');

module.exports = async function down() {
  try {
    const cfg = await configManager.readConfig();
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    const spin = require('ora')('Stopping docker compose...').start();
    try {
      await execa('docker', ['compose', 'down'], { cwd: dockerDir });
      spin.succeed('Docker compose stopped');
      logger.success('Compose stopped');
    } catch (err) {
      spin.fail('Failed to stop compose');
      logger.error(String(err));
      process.exit(1);
    }
  } catch (err) {
    logger.error('Down failed: ' + String(err));
    process.exit(1);
  }
};

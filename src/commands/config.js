const logger = require('../utils/logger');
const configManager = require('../utils/configManager');

const ALLOWED = ['testDir', 'appUrl', 'clientPort', 'postgresPort', 'waitTimeout', 'image'];

module.exports = async function config(action, key, value) {
  try {
    const cfg = await configManager.readConfig();
    if (!action || action === 'show') {
      logger.info(JSON.stringify(cfg, null, 2));
      return;
    }

    if (action === 'set') {
      if (!ALLOWED.includes(key)) {
        logger.error(`Key not allowed. Allowed keys: ${ALLOWED.join(', ')}`);
        process.exit(1);
      }
      // coerce numbers
      const val = /^\d+$/.test(String(value)) ? Number(value) : value;
      await configManager.updateConfig({ [key]: val });
      logger.success(`Updated ${key} = ${val}`);
      return;
    }

  logger.error('Unknown config action. Use `show` or `set <key> <value>`');
    process.exit(1);
  } catch (err) {
    logger.error('Config failed: ' + String(err));
    process.exit(1);
  }
};

const { execa } = require('execa');
const logger = require('../utils/logger');

module.exports = async function status() {
  try {
    const res = await execa('docker', ['ps', '--format', '{{.Names}}|{{.Image}}|{{.Status}}']);
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    const mendix = lines.filter(l => /mendix|mx|postgres/i.test(l));
    if (mendix.length === 0) {
      logger.info('No Mendix containers found');
      return;
    }
    for (const l of mendix) {
      const parts = l.split('|');
      logger.info(`${parts[0]} - ${parts[1]} - ${parts[2]}`);
    }
  } catch (err) {
    logger.error('Failed to get docker ps: ' + String(err));
    process.exit(1);
  }
};

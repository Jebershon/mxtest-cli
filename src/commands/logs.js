const path = require('path');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');

module.exports = async function logs(opts = {}) {
  try {
    const cfg = await configManager.readConfig();
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    const args = ['compose', 'logs'];
    if (opts.tail) args.push('--tail', String(opts.tail));
    if (opts.follow) args.push('--follow');

    const proc = execa('docker', args, { cwd: dockerDir, stdio: 'inherit' });
    return proc;
  } catch (err) {
    logger.error('Logs failed: ' + String(err));
    process.exit(1);
  }
};

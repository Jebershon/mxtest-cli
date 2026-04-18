const ora = require('ora');
const boxen = require('boxen');
const validator = require('../utils/validator');
const logger = require('../utils/logger');

module.exports = async function doctor() {
  try {
    const checks = [
      { name: 'mxcli', fn: validator.checkMxcli },
      { name: 'docker', fn: validator.checkDocker },
      { name: 'playwright', fn: validator.checkPlaywright },
      { name: '.mpr file', fn: () => validator.checkMprFile() }
    ];

    let allOk = true;

    for (const c of checks) {
      const spinner = ora(`Checking ${c.name}...`).start();
      try {
        const res = await c.fn();
        if (res.ok) {
          spinner.succeed(`${c.name} OK ${res.version ? ' - ' + res.version : ''}`);
          logger.success(`${c.name} ready`);
        } else {
          spinner.fail(`${c.name} failed`);
          logger.error(res.message || `${c.name} check failed`);
          allOk = false;
        }
      } catch (err) {
        spinner.fail(`${c.name} failed`);
        logger.error(String(err.message || err));
        allOk = false;
      }
    }

    if (allOk) {
      const out = boxen('All dependencies ready', { padding: 1, borderStyle: 'round', borderColor: 'green' });
      console.log(out);
      return;
    }

    const out = boxen('Some checks failed - see messages above', { padding: 1, borderStyle: 'round', borderColor: 'red' });
    console.log(out);
    process.exit(1);
  } catch (err) {
    logger.error('Doctor failed: ' + String(err));
    process.exit(1);
  }
};

const execa = require('execa');
const logger = require('../utils/logger');

module.exports = async function playwrightCmd(args) {
  try {
    const arr = Array.isArray(args) ? args : (process.argv.slice(3) || []);
    if (arr.length === 0) {
      logger.info('Passing through to npx playwright');
    }
    const proc = execa('npx', ['playwright', ...arr], { stdio: 'inherit' });
    await proc;

    if (arr[0] === 'test') {
      // show report
      try {
        await execa('npx', ['playwright', 'show-report'], { stdio: 'inherit' });
      } catch (err) {
        logger.warn('Could not open report automatically');
      }
    }

    if (arr[0] === 'codegen') {
      logger.info('Tip: Codegen helps create Playwright scripts. Remember to review and convert to tests.');
    }
  } catch (err) {
    logger.error('playwright command failed: ' + String(err));
    process.exit(1);
  }
};

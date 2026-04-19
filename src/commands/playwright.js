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
    logger.error('playwright command failed — exit code: ' + (err && (err.exitCode || err.code) ? (err.exitCode || err.code) : 'unknown'));
    if (err && err.stdout) logger.error('\nstdout:\n' + String(err.stdout));
    if (err && err.stderr) logger.error('\nstderr:\n' + String(err.stderr));
    logger.info('Troubleshooting steps:');
    logger.info('- Run `npm install` to ensure Playwright is installed in this project.');
    logger.info('- Run `npx playwright --version` to confirm the Playwright CLI is available.');
    logger.info('- If Playwright is present but browsers are missing, run `npx playwright install` (or `npx playwright install --with-deps` in CI).');
    logger.info('- For CI, ensure Playwright and browsers are installed in your pipeline before running tests.');
    process.exit(err && err.exitCode ? err.exitCode : 1);
  }
};

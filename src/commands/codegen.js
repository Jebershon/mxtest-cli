const execa = require('execa');
const logger = require('../utils/logger');

module.exports = async function codegenCmd(args) {
  try {
    const arr = Array.isArray(args) ? args : (process.argv.slice(3) || []);
    if (arr.length === 0) {
      logger.info('Usage: mxtest codegen <url> [--output <file>] [--target javascript|ts] [--device "Desktop Chrome"]');
    }

    // Delegate to Playwright CLI
    const proc = execa('npx', ['playwright', 'codegen', ...arr], { stdio: 'inherit' });
    await proc;

    logger.info('Playwright codegen finished — review and convert the generated script into a test.');
  } catch (err) {
    logger.error('codegen failed — exit code: ' + (err && (err.exitCode || err.code) ? (err.exitCode || err.code) : 'unknown'));
    if (err && err.stdout) logger.error('\nstdout:\n' + String(err.stdout));
    if (err && err.stderr) logger.error('\nstderr:\n' + String(err.stderr));
    logger.info('Ensure Playwright is installed and browsers are available (run `npx playwright install`).');
    process.exit(err && err.exitCode ? err.exitCode : 1);
  }
};

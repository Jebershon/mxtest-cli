const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const ui = require('../utils/ui');
const validator = require('../utils/validator');
const { runPlaywrightCmd } = require('../utils/playwrightHelper');
const execa = require('execa');

module.exports = function(program) {
  program
    .command('debug [target]')
    .description('Run Playwright in interactive debug mode (inspector). Use target to specify a file or folder.')
    .option('--cwd <dir>', 'Working directory to run Playwright in')
    .option('--url <url>', 'Application URL to set in APP_URL')
    .action(async (target, opts = {}) => {
      try {
        const cwd = opts.cwd ? path.resolve(process.cwd(), opts.cwd) : process.cwd();

        // Validate Playwright and browsers
        ui.banner('mxtest — debug', 'Preparing Playwright interactive debug session');
        const res = await validator.checkPlaywright();
        if (!res.ok) {
          logger.warn(res.message || 'Playwright validation failed');
          if (res.needsBrowsers) {
            logger.info('Attempting to install Chromium via `npx playwright install chromium`');
            try {
              await execa('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit', cwd });
              logger.success('Chromium installation finished — rechecking Playwright');
            } catch (err) {
              logger.error('Automatic playwright install failed: ' + String(err));
              process.exit(1);
            }
            const re = await validator.checkPlaywright();
            if (!re.ok) {
              logger.error('Playwright check still failing after install: ' + (re.message || 'unknown'));
              process.exit(1);
            }
          } else {
            process.exit(1);
          }
        }

        // Determine test target
        const testTarget = target ? path.resolve(cwd, target) : path.resolve(cwd, 'tests');
        if (!await fs.pathExists(testTarget)) {
          logger.error('Target not found: ' + testTarget);
          process.exit(1);
        }

        const env = Object.assign({}, process.env);
        if (opts.url) env.APP_URL = opts.url;
        // Enable Playwright inspector
        env.PWDEBUG = '1';

        logger.info('Launching Playwright in interactive mode for: ' + testTarget);
        try {
          await runPlaywrightCmd(['test', testTarget, '--headed'], { cwd, env });
        } catch (err) {
          logger.error('Playwright debug session failed: ' + String(err && err.message ? err.message : err));
          process.exit(1);
        }

      } catch (err) {
        logger.error('debug command failed: ' + String(err));
        process.exit(1);
      }
    });
};

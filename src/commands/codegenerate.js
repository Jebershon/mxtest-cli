const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const { runPlaywrightCmd } = require('../utils/playwrightHelper');

module.exports = function(program) {
  program
    .command('codegenerate [url]')
    .description('Launch Playwright codegen (recorder) and save the script to a file')
    .option('--output <file>', 'Output file path (defaults to tests/auto/codegen-<ts>.spec.js)')
    .option('--cwd <dir>', 'Working directory to run Playwright in')
    .option('--force', 'Overwrite existing output file')
    .action(async (url, opts = {}) => {
      try {
        const cwd = opts.cwd ? path.resolve(process.cwd(), opts.cwd) : process.cwd();
        let cfg = {};
        try { cfg = await configManager.readConfig(); } catch (e) { /* ignore */ }

        const targetUrl = url || cfg.appUrl || `http://localhost:${cfg.clientPort || 8080}`;

        const defaultOutDir = cfg.testDir ? path.resolve(cwd, cfg.testDir) : path.join(cwd, 'tests', 'auto');
        const outFile = opts.output ? (path.isAbsolute(opts.output) ? opts.output : path.resolve(cwd, opts.output)) : path.join(defaultOutDir, `codegen-${Date.now()}.spec.js`);

        await fs.ensureDir(path.dirname(outFile));
        if (!opts.force && await fs.pathExists(outFile)) {
          logger.error('Output file already exists: ' + outFile + '. Pass --force to overwrite.');
          process.exit(1);
        }

        logger.info(`Launching Playwright codegen for ${targetUrl} and saving to ${outFile}`);
        try {
          await runPlaywrightCmd(['codegen', targetUrl, '--output', outFile], { cwd, env: Object.assign({}, process.env, { APP_URL: targetUrl }) });
          logger.success('Playwright codegen finished — saved to: ' + outFile);
        } catch (err) {
          logger.error('Playwright codegen failed: ' + (err && err.message ? err.message : String(err)));
          if (err && err.stdout) logger.info('Playwright stdout preview:\n' + String(err.stdout).slice(0,2000));
          process.exit(1);
        }
      } catch (err) {
        logger.error('codegenerate command failed: ' + String(err));
        process.exit(1);
      }
    });
};

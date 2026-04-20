const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const { runPlaywrightCmd } = require('../utils/playwrightHelper');
const ui = require('../utils/ui');
const interactive = require('../utils/interactivePrompt');

module.exports = function(program) {
  program
    .command('codegenerate [url]')
    .description('Launch Playwright codegen (recorder) and save the script to a file')
    .option('--output <file>', 'Output file path (defaults to tests/auto/codegen-<ts>.spec.js)')
    .option('--cwd <dir>', 'Working directory to run Playwright in')
    .option('--force', 'Overwrite existing output file')
    .action(async (url, opts = {}) => {
      try {
        ui.banner('mxtest — codegenerate', 'Launching Playwright code recorder');

        // Prompt interactively if no URL provided
        if (!url && interactive.shouldPromptInteractively(opts, ['url'])) {
          const answers = await interactive.promptForCodegenerate(opts);
          url = answers.url || url;
          opts = { ...opts, ...answers };
        }
        const cwd = opts.cwd ? path.resolve(process.cwd(), opts.cwd) : process.cwd();
        let cfg = {};
        try { cfg = await configManager.readConfig(); } catch (e) { /* ignore */ }

        const targetUrl = url || cfg.appUrl || `http://localhost:${cfg.clientPort || 8080}`;

        // Use configured testDir, defaulting to .mxtest/tests
        const testDir = cfg.testDir || '.mxtest/tests';
        const defaultOutDir = path.resolve(cwd, testDir, 'auto');
        const outFile = opts.output ? (path.isAbsolute(opts.output) ? opts.output : path.resolve(cwd, opts.output)) : path.join(defaultOutDir, `codegen-${Date.now()}.spec.js`);

        await fs.ensureDir(path.dirname(outFile));
        if (!opts.force && await fs.pathExists(outFile)) {
          logger.error('Output file already exists: ' + outFile + '. Pass --force to overwrite.');
          process.exit(1);
        }

        logger.info(`Launching Playwright codegen for ${targetUrl} and saving to ${outFile}`);
        logger.info('Tip: Maximize the browser window to ensure all page elements (including nav-bars) are visible');
        try {
          // Add viewport and window size options to ensure full page visibility including bottom nav-bar
          const playwrightArgs = [
            'codegen',
            targetUrl,
            '--output', outFile,
            '--viewport-size=1280,1024'  // Standard viewport with good height for bottom elements
          ];
          await runPlaywrightCmd(playwrightArgs, { cwd, env: Object.assign({}, process.env, { APP_URL: targetUrl }) });
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

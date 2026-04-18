const path = require('path');
const fs = require('fs-extra');
const ora = require('ora');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const reportGenerator = require('../utils/reportGenerator');
const waitForApp = require('../utils/waitForApp');

module.exports = async function testCmd(options = {}) {
  try {
    // commander passes options object; sometimes first arg is options
    const opts = (typeof options === 'object' && options) || {};
    const cfg = await configManager.readConfig();

    const testDir = path.resolve(process.cwd(), opts.path || cfg.testDir || './tests');
    const url = opts.url || cfg.appUrl;

    if (!await fs.pathExists(testDir)) {
      logger.error(`Test directory not found: ${testDir}`);
      process.exit(1);
    }

    // quick wait
    const spinWait = ora(`Checking application at ${url}`).start();
    try {
      await waitForApp(url, Math.min(5, cfg.waitRetries || 5), cfg.waitDelay || 2000, 20);
      spinWait.succeed('Application reachable');
    } catch (err) {
      spinWait.fail('Application not reachable');
      logger.warn('Continuing to run tests; they may fail if app is down');
    }

    // run playwright test
    const args = ['playwright', 'test', testDir, '--reporter=json'];
    if (opts.headed) args.push('--headed');
    if (opts.browser) args.push('--project=' + opts.browser);
    if (opts.retry) args.push('--repeat-each=' + String(opts.retry));

    const spin = ora('Running Playwright tests').start();
    let res;
    try {
      res = await execa('npx', args);
      spin.succeed('Playwright finished');
    } catch (err) {
      // Playwright returns non-zero on failures; capture stdout if present
      res = err;
      spin.succeed('Playwright finished with failures');
    }

    // Parse JSON from stdout if possible
    let parsed = null;
    try {
      parsed = JSON.parse(res.stdout);
    } catch (err) {
      // fallback: wrap stdout
      parsed = { raw: res.stdout };
    }

    // save results
    const ts = Date.now();
    const outDir = path.join(process.cwd(), cfg.reportDir || './test-results', String(ts));
    await fs.ensureDir(outDir);
    await fs.writeJson(path.join(outDir, 'results.json'), parsed, { spaces: 2 });

    // generate HTML
    const reportPath = await reportGenerator.build(parsed, outDir);

    // print summary
    // Try to compute counts
    let passed = 0, failed = 0, skipped = 0, duration = 0;
    if (parsed && parsed.suites) {
      function walk(s) {
        if (s.tests) {
          for (const t of s.tests) {
            if (t.status === 'passed') passed++;
            if (t.status === 'failed') failed++;
            if (t.status === 'skipped') skipped++;
            duration += (t.duration || 0);
          }
        }
        if (s.suites) s.suites.forEach(walk);
      }
      parsed.suites.forEach(walk);
    }

    logger.success(`✔ ${passed} passed  ✖ ${failed} failed  ⚠ ${skipped} skipped  ⏱ ${Math.round(duration)}ms`);

    if (!opts.ci && !opts.noReport) {
      // open report
      try {
        await execa('npx', ['playwright', 'show-report', outDir], { stdio: 'inherit' });
      } catch (err) {
        logger.warn('Could not open report automatically');
      }
    }

    if (opts.ci && failed > 0) {
      process.exit(1);
    }

  } catch (err) {
    logger.error('Test run failed: ' + String(err));
    process.exit(1);
  }
};

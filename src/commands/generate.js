const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const ui = require('../utils/ui');
const configManager = require('../utils/configManager');
const projectScanner = require('../utils/projectScanner');
const claudeRunner = require('../utils/claudeRunner');
const specParser = require('../utils/specParser');
const generateReporter = require('../utils/generateReporter');
const validator = require('../utils/validator');

module.exports = function(program) {
  program
    .command('generate testcase')
    .description('Generate Playwright test cases using Claude')
    .option('--page <name>')
    .option('--output <dir>')
    .option('--dry-run')
    .option('--skill <path>')
    .action(async (opts = {}) => {
      try {
        // STEP 1 - Preflight
        const cl = await validator.checkClaudeCode();
        if (!cl.ok) {
          logger.error(cl.message || 'Claude validation failed');
          logger.info('Run mxtest doctor to check all dependencies.');
          process.exit(1);
        }

        const cfgPath = configManager.CONFIG_FILE;
        const cfgExists = await fs.pathExists(cfgPath);
        if (!cfgExists) {
          logger.error('mxtest.config.json not found. Run mxtest init first.');
          process.exit(1);
        }
        const cfg = await configManager.readConfig();

        // STEP 2 - Skill Load
        let skillTemplate = '';
        if (opts.skill) {
          const sp = path.isAbsolute(opts.skill) ? opts.skill : path.resolve(process.cwd(), opts.skill);
          if (!await fs.pathExists(sp)) {
            logger.error('Skill file not found: ' + sp);
            process.exit(1);
          }
          skillTemplate = await fs.readFile(sp, 'utf8');
        } else {
          const bundled = path.join(__dirname, '..', 'skills', 'playwright.skill.md');
          skillTemplate = await fs.readFile(bundled, 'utf8');
        }

        // STEP 3 - Project Scan
        const spinScan = ui.startSpinner('Scanning Mendix project structure...');
        const projectContext = await projectScanner.scan(opts.page);
        spinScan.succeed(`Project scanned — ${Array.isArray(projectContext.pages) ? projectContext.pages.length : 0} pages found`);

        // STEP 4 - Prompt Construction
        let finalPrompt = String(skillTemplate);
        finalPrompt = finalPrompt.replace(/__PROJECT_CONTEXT__/g, JSON.stringify(projectContext, null, 2));
        const existingTests = (projectContext.existingTests || []).join(',');
        finalPrompt = finalPrompt.replace(/__EXISTING_TESTS__/g, existingTests);
        const pagesVal = opts.page ? opts.page : (projectContext.pages || []).join(',');
        finalPrompt = finalPrompt.replace(/__PAGES__/g, pagesVal);

        // STEP 5 - Claude Execution
        const spinClaude = ui.startSpinner('Asking Claude to generate test cases...');
        const claudeRes = await claudeRunner.run(finalPrompt);
        if (!claudeRes.ok) {
          spinClaude.fail('Claude generation failed');
          logger.error(claudeRes.message || 'Claude returned an error');
          process.exit(1);
        }
        spinClaude.succeed('Claude finished generating');

        // STEP 6 - Parse Output
        const specs = specParser.extract(claudeRes.output || claudeRes.stdout || '');
        if (!specs || specs.length === 0) {
          logger.warn('Claude did not return any test files. Try again or use --skill to refine the prompt.');
          process.exit(1);
        }

        // STEP 7 - Write Files
        const outputDir = opts.output ? path.resolve(process.cwd(), opts.output) : (cfg.testDir ? path.resolve(process.cwd(), cfg.testDir) : path.resolve(process.cwd(), 'tests'));
        const results = [];
        if (!opts['dry-run']) await fs.ensureDir(outputDir);

        for (const s of specs) {
          const target = path.join(outputDir, s.filename);
          const pagesCovered = (projectContext.pages || []).filter(p => s.filename.toLowerCase().includes(p.toLowerCase()));
          if (opts['dry-run']) {
            logger.info('==== ' + s.filename + ' ===');
            logger.info(s.code);
            results.push({ filename: s.filename, status: 'generated', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
            continue;
          }
          const exists = await fs.pathExists(target);
          if (exists) {
            logger.warn('Skipping existing file: ' + s.filename);
            results.push({ filename: s.filename, status: 'skipped', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
            continue;
          }
          await fs.writeFile(target, s.code, 'utf8');
          logger.success('Generated: ' + s.filename);
          results.push({ filename: s.filename, status: 'generated', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
        }

        // STEP 8 - Run Tests
        let testResults = { totalPassed: 0, totalFailed: 0, totalSkipped: 0, duration: '0s', tests: [] };
        if (!opts['dry-run']) {
          const spinRun = ui.startSpinner('Running generated tests...');
          try {
            const { execa } = require('execa');
            const res = await execa('npx', ['playwright', 'test', outputDir, '--reporter=json'], { cwd: process.cwd(), stdio: 'pipe' });
            // try parse JSON
            try {
              const parsed = JSON.parse(res.stdout);
              // Build a simple normalized testResults if possible
              if (parsed) {
                // best-effort parsing
                const tests = [];
                if (Array.isArray(parsed)) {
                  parsed.forEach((t) => {
                    if (t && t.tests) {
                      t.tests.forEach(tt => tests.push(tt));
                    }
                  });
                }
                testResults = { totalPassed: parsed.stats ? parsed.stats.passed || 0 : 0, totalFailed: parsed.stats ? parsed.stats.failed || 0 : 0, totalSkipped: parsed.stats ? parsed.stats.skipped || 0 : 0, duration: parsed.stats ? (parsed.stats.duration || '0s') : '0s', tests: tests };
              }
            } catch (e) {
              // ignore parse error, assume success when exit code is 0
              testResults = { totalPassed: 0, totalFailed: 0, totalSkipped: 0, duration: '0s', tests: [] };
            }
            spinRun.succeed('Tests completed');
          } catch (err) {
            // test failures or execution error
            const stdout = (err && err.stdout) ? err.stdout : '';
            try {
              const parsed = stdout ? JSON.parse(stdout) : null;
              if (parsed && parsed.stats) {
                testResults = { totalPassed: parsed.stats.passed || 0, totalFailed: parsed.stats.failed || 0, totalSkipped: parsed.stats.skipped || 0, duration: parsed.stats.duration || '0s', tests: [] };
              }
            } catch (e) {
              // ignore
            }
            // stop the spinner before printing
            try { spinRun.fail('Playwright failed'); } catch (e) {}
            logger.error(err.stderr || err.message || 'Playwright run failed');
          }
        }

        // STEP 9 - Generate Report
        if (!opts['dry-run']) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const reportRoot = path.join(process.cwd(), cfg.reportDir || '.mxtest/test-results', `generate-${ts}`);
          await fs.ensureDir(reportRoot);
          const htmlPath = path.join(reportRoot, 'report.html');
          const xlsxPath = path.join(reportRoot, 'test-report.xlsx');
          await generateReporter.buildHTML(projectContext, results, testResults, htmlPath);
          await generateReporter.buildExcel(projectContext, results, testResults, xlsxPath);

          // open report in default browser
          try {
            const openCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
            const { execa } = require('execa');
            execa(openCmd, [htmlPath], { stdio: 'ignore', detached: true });
          } catch (e) {
            // ignore open failures
          }

          // STEP 10 - Terminal Summary
          const summaryLine = `✔ ${testResults.totalPassed || 0} passed  ✗ ${testResults.totalFailed || 0} failed  ⚠ ${testResults.totalSkipped || 0} skipped  ⏱ ${testResults.duration || '0s'}`;
          logger.success(summaryLine);
          logger.box(` ${results.filter(r=>r.status==='generated').length} test files generated.\n Report: ${path.relative(process.cwd(), htmlPath)}\n Excel:  ${path.relative(process.cwd(), xlsxPath)} `);
        } else {
          logger.success('Dry-run complete. No files written.');
        }

      } catch (err) {
        logger.error('generate command failed: ' + String(err));
        process.exit(1);
      }
    });
};

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
const { runPlaywrightCmd } = require('../utils/playwrightHelper');
const interactive = require('../utils/interactivePrompt');

module.exports = function(program) {
  program
    .command('generate')
    .description('Generate Playwright test cases using Claude')
    .option('--page <name>')
    .option('--flow <name>')
    .option('--output <dir>')
    .option('--dry-run')
    .option('--skill <path>')
    .option('--mock <path>')
    .action(async (opts = {}) => {
      try {
        ui.banner('mxtest — generate', 'Generating Playwright tests using Claude');

        // Prompt interactively if minimal options provided
        if (interactive.shouldPromptInteractively(opts, ['page', 'flow'])) {
          const answers = await interactive.promptForGenerate(opts);
          opts = { ...opts, ...answers };
        }
        // STEP 1 - Preflight
        // If using --mock, skip the external Claude CLI check
        let cl;
        if (opts.mock) {
          cl = { ok: true, version: 'mock' };
        } else {
          cl = await validator.checkClaudeCode();
          if (!cl.ok) {
            logger.error(cl.message || 'Claude validation failed');
            logger.info('Run mxtest doctor to check all dependencies.');
            process.exit(1);
          }
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

        // STEP 5 - Claude Execution (support --mock to use local file for testing)
        const spinClaude = ui.startSpinner('Asking Claude to generate test cases...');
        let claudeRes;
        if (opts.mock) {
          try {
            const mockPath = path.isAbsolute(opts.mock) ? opts.mock : path.resolve(process.cwd(), opts.mock);
            if (!await fs.pathExists(mockPath)) {
              spinClaude.fail('Mock file not found');
              logger.error('Mock file not found: ' + mockPath);
              process.exit(1);
            }
            const content = await fs.readFile(mockPath, 'utf8');
            claudeRes = { ok: true, output: content };
            spinClaude.succeed('Used mock file for generation');
          } catch (e) {
            spinClaude.fail('Mock read failed');
            logger.error('Failed to read mock file: ' + String(e));
            process.exit(1);
          }
        } else {
          try {
            claudeRes = await claudeRunner.run(finalPrompt);
          } catch (e) {
            spinClaude.fail('Claude generation failed');
            logger.error('Claude runner error: ' + String(e));
            process.exit(1);
          }
          if (!claudeRes.ok) {
            spinClaude.fail('Claude generation failed');
            logger.error(claudeRes.message || 'Claude returned an error');
            process.exit(1);
          }
          spinClaude.succeed('Claude finished generating');
        }

        // STEP 6 - Parse Output
        let specs;
        try {
          specs = specParser.extract(claudeRes.output || claudeRes.stdout || '');
        } catch (e) {
          spinClaude.fail('Failed to parse Claude output');
          logger.error('Failed to parse Claude output: ' + String(e));
          logger.info('Raw Claude output preview:\n' + ((claudeRes && (claudeRes.output || claudeRes.stdout)) ? String(claudeRes.output || claudeRes.stdout).slice(0,2000) : '<empty>'));
          process.exit(1);
        }
        if (!specs || specs.length === 0) {
          logger.warn('Claude did not return any test files. Try again or use --skill to refine the prompt.');
          process.exit(1);
        }

        // STEP 7 - Write Files (to tests/generated)
        const isDryRun = !!(opts.dryRun || opts['dry-run']);
        const cwd = process.cwd();
        const autoDetect = require('../utils/autoDetect');
        const dirs = await autoDetect.ensureTestDirs(cwd);
        const defaultGenDir = dirs.generated;
        const genDir = opts.output ? path.resolve(cwd, opts.output) : defaultGenDir;
        if (!isDryRun) await fs.ensureDir(genDir);

        const results = [];
        for (const s of specs) {
          // choose filename: prefer provided flow or parser filename
          const baseName = opts.flow ? `${opts.flow}.spec.js` : s.filename || `generated-${Date.now()}.spec.js`;
          const target = path.join(genDir, baseName);
          const pagesCovered = (projectContext.pages || []).filter(p => baseName.toLowerCase().includes(p.toLowerCase()));
          if (isDryRun) {
            logger.info('==== ' + baseName + ' ===');
            logger.info(s.code);
            results.push({ filename: baseName, status: 'generated', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
            continue;
          }
          const exists = await fs.pathExists(target);
          if (exists) {
            logger.warn('Skipping existing file: ' + baseName);
            results.push({ filename: baseName, status: 'skipped', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
            continue;
          }
          await fs.writeFile(target, s.code, 'utf8');
          logger.success('Generated: ' + baseName);
          results.push({ filename: baseName, status: 'generated', pagesCovered: pagesCovered.length ? pagesCovered : (opts.page ? [opts.page] : []) });
        }

        if (isDryRun) {
          logger.success('Dry-run complete. No files written.');
        } else {
          logger.success(`${results.filter(r=>r.status==='generated').length} test files written to ${genDir}`);
        }

      } catch (err) {
        logger.error('generate command failed: ' + String(err));
        process.exit(1);
      }
    });
};

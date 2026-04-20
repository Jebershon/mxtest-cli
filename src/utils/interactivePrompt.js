const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

/**
 * Interactive prompts for mxtest commands
 * Guides users through options without needing to memorize flags
 */

async function promptForTest(opts = {}) {
  const questions = [];

  if (!opts.path) {
    questions.push({
      type: 'input',
      name: 'path',
      message: 'Path to test files (or press Enter for default ./tests)',
      default: './tests',
    });
  }

  if (!opts.url) {
    questions.push({
      type: 'input',
      name: 'url',
      message: 'Application URL to test',
      default: 'http://localhost:8080',
    });
  }

  questions.push({
    type: 'confirm',
    name: 'headed',
    message: 'Run tests in headed mode (visible browser)?',
    default: false,
  });

  questions.push({
    type: 'list',
    name: 'browser',
    message: 'Select browser',
    choices: ['chromium', 'firefox', 'webkit', 'all'],
    default: 'chromium',
  });

  questions.push({
    type: 'input',
    name: 'retry',
    message: 'Number of retries for failed tests',
    default: '0',
    validate: (input) => /^\d+$/.test(input) ? true : 'Please enter a number',
  });

  questions.push({
    type: 'confirm',
    name: 'openReport',
    message: 'Open test report when done?',
    default: true,
  });

  if (questions.length === 0) {
    return opts; // All options already provided
  }

  const answers = await inquirer.prompt(questions);
  return { ...opts, ...answers };
}

async function promptForCodegenerate(opts = {}) {
  const questions = [];

  if (!opts.url) {
    questions.push({
      type: 'input',
      name: 'url',
      message: 'Application URL to record (press Enter for http://localhost:8080)',
      default: 'http://localhost:8080',
    });
  }

  if (!opts.output) {
    questions.push({
      type: 'input',
      name: 'output',
      message: 'Output file path (or press Enter for tests/auto/codegen-<timestamp>.spec.js)',
      default: '',
    });
  }

  questions.push({
    type: 'confirm',
    name: 'force',
    message: 'Overwrite if file already exists?',
    default: false,
  });

  if (questions.length === 0) {
    return opts;
  }

  const answers = await inquirer.prompt(questions);
  return { ...opts, ...answers };
}

async function promptForGenerate(opts = {}) {
  const questions = [];

  questions.push({
    type: 'input',
    name: 'page',
    message: 'Page name (optional, leave blank for all pages)',
    default: '',
  });

  if (!opts.output) {
    questions.push({
      type: 'input',
      name: 'output',
      message: 'Output directory (or press Enter for .mxtest/tests/generated)',
      default: '.mxtest/tests/generated',
    });
  }

  questions.push({
    type: 'input',
    name: 'flow',
    message: 'Flow name (optional, for test file naming)',
    default: '',
  });

  questions.push({
    type: 'list',
    name: 'skill',
    message: 'Select test generation skill',
    choices: [
      { name: 'Mendix Widgets (with DatePicker, ComboBox, Dropdown support)', value: path.join(__dirname, '..', 'skills', 'mendix-widgets.skill.md') },
      { name: 'Basic Playwright (standard approach)', value: path.join(__dirname, '..', 'skills', 'playwright.skill.md') },
      { name: 'Custom skill file', value: 'custom' }
    ],
    default: path.join(__dirname, '..', 'skills', 'mendix-widgets.skill.md'),
  });

  if (!opts.skill) {
    // Add question for custom skill path if user chooses custom
    questions.push({
      type: 'input',
      name: 'customSkillPath',
      message: 'Custom skill file path',
      when: (answers) => answers.skill === 'custom',
      validate: (input) => input.length > 0 ? true : 'Please enter a path',
    });
  }

  questions.push({
    type: 'confirm',
    name: 'dryRun',
    message: 'Dry run (preview without writing files)?',
    default: false,
  });

  const answers = await inquirer.prompt(questions);

  // Handle custom skill path
  if (answers.customSkillPath) {
    answers.skill = answers.customSkillPath;
    delete answers.customSkillPath;
  }

  return { ...opts, ...answers };
}

async function promptForDebug(opts = {}) {
  const questions = [];

  questions.push({
    type: 'input',
    name: 'target',
    message: 'Test file or folder (or press Enter for ./tests)',
    default: './tests',
  });

  questions.push({
    type: 'input',
    name: 'url',
    message: 'Application URL (optional)',
    default: '',
  });

  const answers = await inquirer.prompt(questions);
  return { ...opts, ...answers };
}

/**
 * Check if user provided any relevant flags
 * If not, prompt interactively
 */
function shouldPromptInteractively(opts, requiredKeys = []) {
  // If quiet mode, don't prompt
  if (opts.quiet) return false;

  // If any required key is present, user likely knows what they want
  if (requiredKeys.length > 0) {
    return !requiredKeys.some((key) => opts[key] !== undefined && opts[key] !== null);
  }

  // If no options provided at all, prompt
  return Object.keys(opts).length === 0;
}

module.exports = {
  promptForTest,
  promptForCodegenerate,
  promptForGenerate,
  promptForDebug,
  shouldPromptInteractively,
};

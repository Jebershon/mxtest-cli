#!/usr/bin/env node

const { program } = require('commander');

program
  .name('mxtest')
  .description('Mendix + Playwright Testing CLI')
  .version('1.0.0');

// Register commands
program
  .command('doctor')
  .description('Check environment and dependencies')
  .action(require('../src/commands/doctor'));

program
  .command('init')
  .description('Initialize testing setup')
  .action(require('../src/commands/init'));

program
  .command('build [clientPort] [postgresPort]')
  .description('Build Mendix docker images and prepare docker artifacts (.env, docker-compose)')
  .action(require('../src/commands/build'));

program
  .command('run')
  .description('Run the prepared Docker compose inside the .docker directory and wait for the app')
  .option('--no-rebuild', 'Skip running mxtest build before composing')
  .action((opts) => require('../src/commands/run')(opts));

program
  .command('run-build')
  .description('Force rebuild the app, recreate .docker, and run docker compose (down then up)')
  .option('--no-wait', 'Do not wait for the application URL to become available')
  .action(() => require('../src/commands/run-build')());

program
  .command('test')
  .allowUnknownOption()
  .option('--path <path>', 'Path to tests')
  .option('--url <url>', 'Application URL to test against')
  .option('--headed', 'Run headed')
  .option('--browser <browser>', 'Browser (chromium|firefox|webkit)')
  .option('--retry <n>', 'Retry count')
  .option('--ci', 'CI mode (exit non-zero on failures)')
  .option('--no-report', 'Do not open report')
  .description('Run Playwright tests')
  .action(require('../src/commands/test'));

program
  .command('result')
  .description('Show last Playwright report')
  .action(() => {
    const cmd = require('../src/commands/playwright');
    return cmd(['show-report']);
  });

program
  .command('down')
  .description('Stop docker compose')
  .action(require('../src/commands/down'));

program
  .command('status')
  .description('Show docker status for Mendix containers')
  .action(require('../src/commands/status'));

program
  .command('logs')
  .option('--tail <n>', 'Number of lines to tail')
  .option('--follow', 'Follow logs')
  .description('Show docker compose logs')
  .action(require('../src/commands/logs'));

program
  .command('config [action] [key] [value]')
  .description('Show or set config values')
  .action(require('../src/commands/config'));

program
  .command('playwright [...args]')
  .description('Pass-through to npx playwright')
  .allowUnknownOption()
  .action(require('../src/commands/playwright'));

program.parse();
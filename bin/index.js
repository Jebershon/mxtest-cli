#!/usr/bin/env node

const { program } = require('commander');

// Support a global quiet flag to keep logs short and simple
program.option('-q, --quiet', 'Minimal output (quiet)');
const logger = require('../src/utils/logger');
// If user passed -q/--quiet, enable minimal logger early
if (process.argv.includes('-q') || process.argv.includes('--quiet')) {
  logger.setMinimal(true);
}

program
  .name('mxtest')
  .description('Mendix + Playwright Testing CLI')
  .version('1.0.3');

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
  .option('--force', 'Force removal of existing .docker even if snapshot fails')
  .option('--mxbuild-path <path>', 'Path to mxbuild executable compatible with portable-app-package')
  .action((clientPort, postgresPort, opts) => require('../src/commands/build')(clientPort, postgresPort, opts));

program
  .command('run')
  .description('Run the prepared Docker compose inside the .docker directory and wait for the app')
  .option('--no-rebuild', 'Skip running mxtest build before composing')
  .action((opts) => require('../src/commands/run')(opts));

program
  .command('run-build')
  .description('Force rebuild the app, recreate .docker, and run docker compose (down then up)')
  .option('--no-wait', 'Do not wait for the application URL to become available')
  .option('--force', 'Force removal of existing .docker even if snapshot fails')
  .option('--mxbuild-path <path>', 'Path to mxbuild executable compatible with portable-app-package')
  .action((opts) => require('../src/commands/run-build')(opts));

program
  .command('test')
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
  .command('report')
  .description('Open latest test HTML report')
  .action(() => require('../src/commands/report')());

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

// Direct Playwright passthrough removed to enforce controlled commands

require('../src/commands/generate')(program);
require('../src/commands/codegenerate')(program);
require('../src/commands/debug')(program);

// `db` command removed: database management handled externally or via snapshots

program
  .command('snapshot [action] [name]')
  .description('Manage DB snapshots (save|list|restore)')
  .option('--verbose', 'Print detailed diagnostics during snapshot operations')
  .action((action, name, opts) => require('../src/commands/snapshot')(action, name, opts));

// Default commander parsing
program.parse();
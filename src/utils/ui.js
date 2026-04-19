const boxen = require('boxen');
const ora = require('ora');
const logger = require('./logger');

function banner(title, subtitle) {
  const lines = [title];
  if (subtitle) lines.push(subtitle);
  logger.box(lines.join('\n'));
}

function startSpinner(message, opts = {}) {
  const tone = opts.tone || 'Working';
  const spinner = ora({ text: `${tone}: ${message}`, color: opts.color || 'cyan' }).start();
  return spinner;
}

function separator() {
  logger.info('────────────────────────────────────────────────────────');
}

module.exports = { banner, startSpinner, separator };

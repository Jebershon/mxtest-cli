const chalk = require('chalk');
const boxen = require('boxen');

function info(msg) {
  console.log(chalk.cyan(msg));
}

function success(msg) {
  console.log(chalk.green(msg));
}

function warn(msg) {
  console.log(chalk.yellow(msg));
}

function error(msg) {
  console.log(chalk.red(msg));
}

function step(msg) {
  console.log(chalk.blue('→ ' + msg));
}

function boxed(msg, opts) {
  console.log(boxen(msg, Object.assign({ padding: 1, margin: 1, borderStyle: 'round' }, opts)));
}

module.exports = {
  info,
  success,
  warn,
  error,
  step,
  box: boxed
};

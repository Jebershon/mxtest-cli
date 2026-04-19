const chalk = require('chalk');
const boxen = require('boxen');

let minimal = false;

function setMinimal(v) {
  minimal = !!v;
}

function info(msg) {
  if (minimal) return;
  console.log(chalk.cyan(msg));
}

function success(msg) {
  if (minimal) return console.log(chalk.green(msg));
  console.log(chalk.green(msg));
}

function warn(msg) {
  console.log(chalk.yellow(msg));
}

function error(msg) {
  console.log(chalk.red(msg));
}

function step(msg) {
  if (minimal) return;
  console.log(chalk.blue('→ ' + msg));
}

function boxed(msg, opts) {
  if (minimal) return;
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

const ora = require('ora');
const boxen = require('boxen');
const inquirer = require('inquirer');
const validator = require('../utils/validator');
const logger = require('../utils/logger');

module.exports = async function doctor(opts = {}) {
  // opts.exitOnFailure: when true (default) doctor will call process.exit(1) on failures.
  // When false, doctor will return a boolean and not exit the process (useful when called programmatically).
  const exitOnFailure = opts.exitOnFailure !== false;
  try {
    const checks = [
      { name: 'mxcli', fn: validator.checkMxcli },
      { name: 'docker', fn: validator.checkDocker },
      { name: 'playwright', fn: validator.checkPlaywright },
      { name: '.mpr file', fn: () => validator.checkMprFile() },
      { name: 'postgres client (pg_dump/psql)', fn: validator.checkPgClient }
    ];

    let allOk = true;

    for (const c of checks) {
      const spinner = ora(`Checking ${c.name}...`).start();
      try {
        let res = await c.fn();
        if (res.ok) {
          spinner.succeed(`${c.name} OK ${res.version ? ' - ' + res.version : ''}`);
          logger.success(`${c.name} ready`);
          continue;
        }

        // initial fail
        spinner.fail(`${c.name} failed`);
        logger.error(res.message || `${c.name} check failed`);
        allOk = false;

        // If non-interactive, we cannot prompt; continue to next
        if (!process.stdout.isTTY) {
          continue;
        }

        // interactive re-check loop: show install guidance and let user install then re-check
        const guidance = boxen(res.message || 'See installation instructions for ' + c.name, { padding: 1, borderStyle: 'round', borderColor: 'yellow' });
        console.log(guidance);

        let tryAgain = true;
        while (tryAgain) {
          let answer;
          try {
            answer = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'recheck',
                message: `Have you installed or fixed ${c.name}? Select Yes to re-check now. (No to skip)`,
                default: true
              }
            ]);
          } catch (promptErr) {
            // inquirer can throw when stdin is closed (ERR_USE_AFTER_CLOSE) — treat as user skipping re-check
            logger.warn(`Prompt interrupted: ${String(promptErr.message || promptErr)}`);
            tryAgain = false;
            break;
          }

          if (!answer.recheck) {
            // user chose to skip re-checking this dependency
            tryAgain = false;
            break;
          }

          const spin = ora(`Re-checking ${c.name}...`).start();
          try {
            res = await c.fn();
            if (res.ok) {
              spin.succeed(`${c.name} OK ${res.version ? ' - ' + res.version : ''}`);
              logger.success(`${c.name} ready`);
              allOk = allOk && true;
              tryAgain = false;
              break;
            } else {
              spin.fail(`${c.name} still failing`);
              console.log(boxen(res.message || `${c.name} still failing`, { padding: 1 }));
              // loop again
            }
          } catch (err) {
            spin.fail(`${c.name} re-check failed`);
            console.log(boxen(String(err.message || err), { padding: 1 }));
            // loop again
          }
        }

      } catch (err) {
        spinner.fail(`${c.name} failed`);
        logger.error(String(err.message || err));
        allOk = false;
      }
    }

    if (allOk) {
      const out = boxen('All dependencies ready', { padding: 1, borderStyle: 'round', borderColor: 'green' });
      console.log(out);
      return true;
    }

    const out = boxen('Some checks failed - see messages above', { padding: 1, borderStyle: 'round', borderColor: 'red' });
    console.log(out);
    if (exitOnFailure) process.exit(1);
    return false;
  } catch (err) {
    logger.error('Doctor failed: ' + String(err));
    if (exitOnFailure) process.exit(1);
    return false;
  }
};

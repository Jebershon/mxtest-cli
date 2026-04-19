const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, Object.assign({ stdio: 'inherit', shell: false }, opts));
  return res.status === 0;
}

async function main() {
  console.log('Running pre-commit checks: mxtest doctor');
  const bin = path.join(process.cwd(), 'bin', 'index.js');
  const okDoctor = run(process.execPath, [bin, 'doctor']);
  if (!okDoctor) {
    console.error('\nPre-commit: mxtest doctor failed. Fix issues before committing.');
    process.exit(1);
  }

  // Optionally run npm test if defined (non-failing placeholder test will pass)
  try {
    const okTest = run(process.execPath, [require.resolve('npm/bin/npm-cli'), 'run', 'test']);
    if (!okTest) {
      console.error('\nPre-commit: npm test failed. Fix tests before committing.');
      process.exit(1);
    }
  } catch (err) {
    // npm not available or no test script - ignore
  }

  console.log('Pre-commit checks passed.');
}

main();

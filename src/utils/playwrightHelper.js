const execa = require('execa');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

async function runPlaywrightCmd(playArgs, opts = {}) {
  const capture = !!opts.captureStdout;
  const extraEnv = opts.env || {};
  const cwd = opts.cwd || process.cwd();
  const candidates = [];

  // Try resolving built-in CLI packages first
  try {
    const cliScript = require.resolve('playwright/bin/playwright');
    candidates.push({ type: 'node-script', cmd: process.execPath, args: [cliScript, ...playArgs], source: cliScript });
  } catch (e) {}

  try {
    const cliScript2 = require.resolve('@playwright/test/bin/playwright');
    candidates.push({ type: 'node-script', cmd: process.execPath, args: [cliScript2, ...playArgs], source: cliScript2 });
  } catch (e) {}

  // Try resolving from current project
  try {
    const projScript = require.resolve('playwright/bin/playwright', { paths: [process.cwd()] });
    candidates.push({ type: 'node-script', cmd: process.execPath, args: [projScript, ...playArgs], source: projScript });
  } catch (e) {}

  try {
    const projScript2 = require.resolve('@playwright/test/bin/playwright', { paths: [process.cwd()] });
    candidates.push({ type: 'node-script', cmd: process.execPath, args: [projScript2, ...playArgs], source: projScript2 });
  } catch (e) {}

  // Check node_modules/.bin in project
  const localBinProject = path.join(process.cwd(), 'node_modules', '.bin', 'playwright' + (process.platform === 'win32' ? '.cmd' : ''));
  if (await fs.pathExists(localBinProject)) candidates.push({ type: 'bin', cmd: localBinProject, args: playArgs, source: localBinProject });

  // Check node_modules/.bin in CLI package root
  const cliRoot = path.resolve(__dirname, '..', '..');
  const localBinCli = path.join(cliRoot, 'node_modules', '.bin', 'playwright' + (process.platform === 'win32' ? '.cmd' : ''));
  if (await fs.pathExists(localBinCli)) candidates.push({ type: 'bin', cmd: localBinCli, args: playArgs, source: localBinCli });

  // Fallback to npx
  candidates.push({ type: 'npx', cmd: 'npx', args: ['playwright', ...playArgs], source: 'npx playwright' });

  let lastErr = null;
  for (const c of candidates) {
    try {
      logger.info(`Attempting Playwright via ${c.source}`);
      const env = Object.assign({}, process.env, extraEnv);
      if (capture) {
        const res = await execa(c.cmd, c.args, { stdio: 'pipe', env, cwd });
        return res;
      } else {
        await execa(c.cmd, c.args, { stdio: 'inherit', env, cwd });
        return;
      }
    } catch (err) {
      lastErr = err;
      logger.warn(`Attempt using ${c.source} failed: ${String(err).split('\n')[0]}`);
      // try next candidate
    }
  }

  const e = new Error('Failed to invoke Playwright via local binaries or npx');
  e.cause = lastErr;
  throw e;
}

module.exports = { runPlaywrightCmd };

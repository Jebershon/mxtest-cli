const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');

async function checkMxcli() {
  try {
    const res = await execa('mx', ['--version']);
    return { ok: true, version: res.stdout.trim() };
  } catch (err) {
    return { ok: false, message: 'mx CLI not found. Install mx (mxcli). See https://docs.mendix.com/refguide/mx-command-line-tool/' };
  }
}

async function checkDocker() {
  try {
    const res = await execa('docker', ['--version']);
    return { ok: true, version: res.stdout.trim() };
  } catch (err) {
    return { ok: false, message: 'Docker not found. Install Docker Desktop. https://www.docker.com/products/docker-desktop/' };
  }
}

async function checkPlaywright() {
  try {
    const res = await execa('npx', ['playwright', '--version']);
    return { ok: true, version: res.stdout.trim() };
  } catch (err) {
    return { ok: false, message: 'Playwright not installed. Run `npm install -D @playwright/test && npx playwright install`' };
  }
}

async function checkMprFile(providedPath) {
  try {
    if (providedPath) {
      const p = path.resolve(process.cwd(), providedPath);
      const exists = await fs.pathExists(p);
      if (exists) return { ok: true, file: p };
      return { ok: false, message: `Provided .mpr file not found: ${p}` };
    }

    const files = await fs.readdir(process.cwd());
    const mprs = files.filter(f => f.endsWith('.mpr'));
    if (mprs.length > 0) {
      return { ok: true, file: path.join(process.cwd(), mprs[0]) };
    }
    return { ok: false, message: 'No .mpr file found in current directory. Run inside a Mendix project or provide a path.' };
  } catch (err) {
    return { ok: false, message: 'Error checking for .mpr file: ' + String(err) };
  }
}

module.exports = {
  checkMxcli,
  checkDocker,
  checkPlaywright,
  checkMprFile
};

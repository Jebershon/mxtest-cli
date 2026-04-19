const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');

async function checkMxcli() {
  try {
    const res = await execa('mxcli', ['--version']);
    return { ok: true, version: res.stdout.trim() };
  } catch (err) {
    return { ok: false, message: 'mxcli not found. Install mxcli. See https://docs.mendix.com/refguide/mx-command-line-tool/' };
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

async function checkPgClient() {
  try {
    // Check for pg_dump or psql availability
    await execa('pg_dump', ['--version']);
    await execa('psql', ['--version']);
    return { ok: true, version: 'pg client available' };
  } catch (err) {
    // If native clients not available, check for Docker as a fallback
    try {
      const res = await execa('docker', ['--version']);
      return { ok: true, version: `docker fallback - ${res.stdout.trim()}` };
    } catch (err2) {
      return { ok: false, message: 'Postgres client not found (pg_dump/psql) and Docker not available. Install PostgreSQL client tools or enable Docker. See https://www.postgresql.org/download/ or https://www.pgadmin.org/download/' };
    }
  }
}

async function checkClaudeCode() {
  try {
    const res = await execa('claude', ['--version']);
    return { ok: true, version: (res && res.stdout) ? res.stdout.trim() : 'unknown' };
  } catch (err) {
    return { ok: false, message: 'Claude Code not found. Install: npm install -g @anthropic-ai/claude-code then run: claude login' };
  }
}

module.exports = {
  checkMxcli,
  checkDocker,
  checkPlaywright,
  checkMprFile
  ,checkPgClient
  ,checkClaudeCode
};

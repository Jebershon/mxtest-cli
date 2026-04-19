const path = require('path');
const execa = require('execa');
const fs = require('fs-extra');
const logger = require('./logger');
const ui = require('./ui');
const snapshot = require('./snapshotManager');
const dbManager = require('./dbManager');

async function containersRunningForCompose(composeFilePath) {
  try {
    const psOut = (await execa('docker', ['compose', '-f', composeFilePath, 'ps', '--format', '{{.Service}} {{.State}}'])).stdout || '';
    const lines = psOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.some(l => /\brunning\b/i.test(l));
  } catch (e) {
    // fallback to docker ps image heuristics
    try {
      const images = (await execa('docker', ['ps', '--format', '{{.Image}}'])).stdout || '';
      const imgs = images.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const wantA = imgs.some(img => img.startsWith('eclipse-temurin') || img.includes('temurin'));
      const wantB = imgs.some(img => img.startsWith('postgres') || img.includes('postgres:17'));
      return wantA && wantB;
    } catch (inner) {
      return false;
    }
  }
}

async function saveBaselineIfNeeded(dockerDir, opts = {}) {
  const dbCfg = dbManager.readConfig().db || {};
  const isInternal = !dbCfg.mode || dbCfg.mode === 'internal';
  if (!isInternal) {
    logger.info('DB mode is external — skipping baseline snapshot');
    return false;
  }

  if (!await fs.pathExists(dockerDir)) {
    logger.info('.docker not found — skipping baseline snapshot (first build)');
    return false;
  }

  const composePath = path.join(dockerDir, 'docker-compose.yml');
  const running = await containersRunningForCompose(composePath);
  if (!running) {
    logger.info('No running containers detected for the project; skipping baseline snapshot and preserving .docker.');
    return false;
  }

  const can = await snapshot.canBackup();
  if (!can) {
    logger.info('No snapshot strategy available (pg_dump/docker); skipping baseline snapshot and preserving .docker');
    return false;
  }

  const spin = ui.startSpinner('Saving baseline snapshot...');
  try {
    const TIMEOUT_MS = 2 * 60 * 1000;
    await Promise.race([snapshot.save('baseline'), new Promise((_, rej) => setTimeout(() => rej(new Error('Snapshot timed out')), TIMEOUT_MS))]);
    spin.succeed('Baseline snapshot saved');
    return true;
  } catch (err) {
    try { const t = ui.startSpinner(''); t.fail('Failed to create baseline snapshot'); } catch (e) {}
    logger.warn('Failed to create baseline snapshot: ' + String(err));
    return false;
  }
}

async function restoreBaselineIfPresent(composePath, dockerDir) {
  const dbCfg = dbManager.readConfig().db || {};
  const isInternal = !dbCfg.mode || dbCfg.mode === 'internal';
  if (!isInternal) return false;

  const snaps = snapshot.list();
  const baselineFile = snaps.find(s => path.parse(s).name === 'baseline');
  if (!baselineFile) return false;

  // try to detect DB service inside compose
  try {
    const ps = await execa('docker', ['compose', '-f', composePath, 'ps', '--services']);
    const services = (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const candidate = services.find(s => /postgres|postgresql|db/i.test(s)) || services[0];
    if (candidate) {
      const waitMs = 60 * 1000;
      const interval = 1000;
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < waitMs) {
        try {
          await execa('docker', ['compose', '-f', composePath, 'exec', '-T', candidate, 'pg_isready', '-q'], { timeout: 5000 });
          ready = true; break;
        } catch (e) {
          await new Promise(r => setTimeout(r, interval));
        }
      }
      if (!ready) logger.warn('DB did not become ready within timeout; attempting restore anyway');
    }
  } catch (e) {
    // ignore detection errors
  }

  const spin = ui.startSpinner('Restoring baseline snapshot into DB...');
  try {
    await snapshot.restore(baselineFile);
    spin.succeed('Baseline snapshot restored into DB');
    return true;
  } catch (err) {
    spin.fail('Failed to restore baseline snapshot');
    logger.warn('Baseline restore failed: ' + String(err));
    return false;
  }
}

module.exports = { saveBaselineIfNeeded, restoreBaselineIfPresent };

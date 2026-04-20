const execa = require('execa');
const fs = require('fs-extra');
const path = require('path');
const waitForApp = require('./waitForApp');
const configManager = require('./configManager');
const logger = require('./logger');

async function detectAppUrl(options = {}) {
  const cwd = options.cwd || process.cwd();
  let cfg = {};
  try { cfg = await configManager.readConfig(); } catch (e) { cfg = {}; }

  if (cfg.appUrl) return cfg.appUrl;

  const clientPort = cfg.clientPort || 8080;
  const candidate = `http://localhost:${clientPort}`;

  // quick reachability check
  try {
    await waitForApp(candidate, 1, 1000, 2);
    return candidate;
  } catch (e) {
    // try docker inspection
  }

  try {
    const res = await execa('docker', ['ps', '--format', '{{.Names}}|{{.Ports}}'], { cwd });
    const lines = String(res.stdout || '').split(/\r?\n/).filter(Boolean);
    for (const ln of lines) {
      const parts = ln.split('|');
      const ports = parts[1] || '';
      // look for mapping like 0.0.0.0:32768->8080/tcp
      const m = ports.match(/(?:(?:0.0.0.0|::):(?<host>\d+)->(?<container>\d+)\/tcp)/g);
      if (m) {
        for (const seg of m) {
          const segMatch = seg.match(/(?:(?:0.0.0.0|::):(?<host>\d+)->(?<container>\d+)\/tcp)/);
          if (segMatch && segMatch.groups) {
            const host = segMatch.groups.host; const container = segMatch.groups.container;
            if (String(container) === String(clientPort) || String(container) === '8080') {
              const url = `http://localhost:${host}`;
              try { await waitForApp(url, 1, 1000, 2); return url; } catch (_) { /* ignore */ }
            }
          }
        }
      }
    }
  } catch (e) {
    logger.warn('Docker inspect for app URL failed: ' + String(e));
  }

  // fallback to candidate URL even if unreachable
  return candidate;
}

async function ensureTestDirs(cwd = process.cwd()) {
  const base = path.join(cwd, 'tests');
  const autoDir = path.join(base, 'auto');
  const genDir = path.join(base, 'generated');
  await fs.ensureDir(base);
  await fs.ensureDir(autoDir);
  await fs.ensureDir(genDir);
  return { base, auto: autoDir, generated: genDir };
}

module.exports = { detectAppUrl, ensureTestDirs };

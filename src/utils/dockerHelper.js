const fs = require('fs-extra');
const execa = require('execa');
const logger = require('./logger');

async function startDockerDesktopIfWindows(err) {
  try {
    const msg = err && (err.stderr || err.message || err.stdout) ? String(err.stderr || err.message || err.stdout) : '';
    if (process.platform !== 'win32') return false;
    if (!/npipe:|dockerDesktopLinuxEngine|failed to connect to the docker api|The system cannot find the file specified/i.test(msg)) return false;

    const candidates = [
      'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      'C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe'
    ];
    let exePath = null;
    for (const p of candidates) {
      if (await fs.pathExists(p)) { exePath = p; break; }
    }
    if (!exePath) {
      logger.warn('Docker Desktop executable not found at expected locations; cannot auto-start.');
      return false;
    }

    logger.info('Detected Docker Desktop may not be running. Attempting to start it...');
    try {
      await execa('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${exePath.replace(/'/g, "''")}'`], { windowsHide: true });
    } catch (spawnErr) {
      logger.warn('Failed to invoke Start-Process to launch Docker Desktop: ' + String(spawnErr));
      try {
        const p = execa(exePath, [], { detached: true, windowsHide: true });
        if (p && p.unref) p.unref();
      } catch (fallbackErr) {
        logger.warn('Fallback launch of Docker Desktop failed: ' + String(fallbackErr));
      }
    }

    const retries = 30;
    const delayMs = 2000;
    for (let i = 0; i < retries; i++) {
      try {
        await execa('docker', ['info']);
        logger.info('Docker daemon is reachable');
        return true;
      } catch (checkErr) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    logger.warn('Timed out waiting for Docker daemon to become available after starting Docker Desktop');
    return false;
  } catch (e) {
    logger.warn('Error while attempting to start Docker Desktop: ' + String(e));
    return false;
  }
}

module.exports = { startDockerDesktopIfWindows };

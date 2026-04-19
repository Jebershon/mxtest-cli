const fs = require('fs-extra');
const path = require('path');
let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  // pg may not be installed; testConnection will fail gracefully
  Client = null;
}

const base = path.join(process.cwd(), '.mxtest');
const cfgPath = path.join(base, 'config.json');
const envPath = path.join(base, '.env');

function ensure() {
  fs.ensureDirSync(base);
  if (!fs.existsSync(cfgPath)) {
    fs.writeJsonSync(cfgPath, { db: { mode: 'internal' } }, { spaces: 2 });
  }
}

function readConfig() {
  ensure();
  try {
    return fs.readJsonSync(cfgPath);
  } catch (e) {
    return { db: { mode: 'internal' } };
  }
}

function saveConfig(db) {
  ensure();
  fs.writeJsonSync(cfgPath, { db }, { spaces: 2 });
}

function savePassword(pass) {
  ensure();
  fs.writeFileSync(envPath, `MXTEST_DB_PASSWORD=${pass}`, { encoding: 'utf8' });
}

function loadPassword() {
  try {
    if (!fs.existsSync(envPath)) return null;
    const txt = fs.readFileSync(envPath, 'utf8').trim();
    const parts = txt.split('=');
    return parts.slice(1).join('=');
  } catch (e) {
    return null;
  }
}

async function testConnection(cfg, password) {
  // Prefer Node 'pg' client if available for a fast programmatic check
  if (Client) {
    try {
      const client = new Client({
        host: cfg.host || 'localhost',
        port: cfg.port || 5432,
        user: cfg.user,
        password,
        database: cfg.name
      });
      await client.connect();
      await client.end();
      return true;
    } catch (err) {
      // fallthrough to CLI check
    }
  }

  // Fall back to using psql CLI to perform a connectivity check
  const execa = require('execa');
  try {
    const args = [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-c', 'SELECT 1;'
    ];
    const res = await execa('psql', args, { env: { ...process.env, PGPASSWORD: password }, stdio: 'ignore' });
    return res.exitCode === 0;
  } catch (err) {
    return false;
  }
}

function maskPassword() {
  return '••••••';
}

module.exports = { readConfig, saveConfig, savePassword, loadPassword, testConnection, maskPassword };

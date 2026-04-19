const execa = require('execa');
const path = require('path');
const fs = require('fs-extra');
const db = require('./dbManager');

const snapDir = path.join(process.cwd(), '.mxtest', 'snapshots');

function ensure() {
  fs.ensureDirSync(snapDir);
}

async function save(name) {
  ensure();
  const cfg = db.readConfig().db || {};
  const pass = db.loadPassword();
  const file = path.join(snapDir, `${name}.sql`);

  await execa('pg_dump', [
    '-h', cfg.host || 'localhost',
    '-p', String(cfg.port || 5432),
    '-U', cfg.user || 'postgres',
    '-d', cfg.name || 'postgres',
    '-f', file
  ], { env: { ...process.env, PGPASSWORD: pass } });
}

async function restore(name) {
  ensure();
  const cfg = db.readConfig().db || {};
  const pass = db.loadPassword();
  const file = path.join(snapDir, `${name}.sql`);
  if (!fs.existsSync(file)) throw new Error('Snapshot not found: ' + name);

  await execa('psql', [
    '-h', cfg.host || 'localhost',
    '-p', String(cfg.port || 5432),
    '-U', cfg.user || 'postgres',
    '-d', cfg.name || 'postgres',
    '-f', file
  ], { env: { ...process.env, PGPASSWORD: pass }, stdio: 'inherit' });
}

function list() {
  ensure();
  return fs.readdirSync(snapDir).filter(f => f.endsWith('.sql')).map(f => f.replace(/\.sql$/, ''));
}

module.exports = { save, restore, list };

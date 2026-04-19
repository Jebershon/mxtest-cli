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

  // Try native pg_dump first
  try {
    await execa('pg_dump', [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-f', file
    ], { env: { ...process.env, PGPASSWORD: pass } });
    return;
  } catch (err) {
    // fallthrough to docker fallback
  }

  // Docker fallback: run pg_dump inside a postgres image and capture stdout
  try {
    const image = 'postgres:17-alpine';
    const args = [
      'run','--rm',
      '--env', `PGPASSWORD=${pass || ''}`,
      image,
      'pg_dump',
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres'
    ];
    const res = await execa('docker', args, { env: process.env });
    await fs.writeFile(file, res.stdout, 'utf8');
    return;
  } catch (err) {
    throw new Error('Failed to create snapshot: native pg_dump not found and Docker fallback failed. ' + String(err));
  }
}

async function restore(name) {
  ensure();
  const cfg = db.readConfig().db || {};
  const pass = db.loadPassword();
  const file = path.join(snapDir, `${name}.sql`);
  if (!fs.existsSync(file)) throw new Error('Snapshot not found: ' + name);

  // Try native psql first
  try {
    await execa('psql', [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-f', file
    ], { env: { ...process.env, PGPASSWORD: pass }, stdio: 'inherit' });
    return;
  } catch (err) {
    // fallthrough to docker fallback
  }

  // Docker fallback: run psql inside postgres image and pipe the snapshot as stdin
  try {
    const image = 'postgres:17-alpine';
    const args = [
      'run','--rm','-i',
      '--env', `PGPASSWORD=${pass || ''}`,
      image,
      'psql',
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres'
    ];
    const content = await fs.readFile(file);
    await execa('docker', args, { input: content, env: process.env, stdio: 'inherit' });
    return;
  } catch (err) {
    throw new Error('Failed to restore snapshot: native psql not found and Docker fallback failed. ' + String(err));
  }
}

function list() {
  ensure();
  return fs.readdirSync(snapDir).filter(f => f.endsWith('.sql')).map(f => f.replace(/\.sql$/, ''));
}

module.exports = { save, restore, list };

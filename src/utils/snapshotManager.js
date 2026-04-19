// Snapshot manager: prefer native pg_dump/psql, then docker compose exec, then docker run.
const execa = require('execa');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const db = require('./dbManager');
const configManager = require('./configManager');
const logger = require('./logger');

const snapDir = path.join(process.cwd(), '.mxtest', 'snapshots');
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function ensure() {
  fs.ensureDirSync(snapDir);
}

async function getComposeFilePath() {
  try {
    const cfg = await configManager.readConfig();
    return path.join(process.cwd(), cfg.dockerDir || '.docker', 'docker-compose.yml');
  } catch (e) {
    return path.join(process.cwd(), '.docker', 'docker-compose.yml');
  }
}

async function tryNativeDump(cfg, pass, file) {
  try {
    await execa('pg_dump', [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-f', file
    ], { env: { ...process.env, PGPASSWORD: pass }, timeout: DEFAULT_TIMEOUT_MS });
    return true;
  } catch (err) {
    return false;
  }
}

async function tryNativeDumpPlain(cfg, pass, file) {
  try {
    await execa('pg_dump', [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-f', file
    ], { env: { ...process.env, PGPASSWORD: pass }, timeout: DEFAULT_TIMEOUT_MS });
    return true;
  } catch (err) {
    return false;
  }
}

async function tryComposeExecDump(composeFile, cfg, pass, file) {
  try {
    const ps = await execa('docker', ['compose', '-f', composeFile, 'ps', '--services']);
    const services = (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const candidate = services.find(s => /postgres|postgresql|db/i.test(s)) || services[0];
    if (!candidate) return false;

    let svcUser = cfg.user || 'postgres';
    let svcDb = cfg.name || 'postgres';
    let svcPass = pass || '';
    try {
      const envRes = await execa('docker', ['compose', '-f', composeFile, 'exec', '-T', candidate, 'printenv']);
      const envLines = (envRes.stdout || '').split(/\r?\n/);
      const envObj = {};
      for (const line of envLines) {
        const idx = line.indexOf('=');
        if (idx > 0) envObj[line.slice(0, idx)] = line.slice(idx + 1);
      }
      svcUser = envObj.POSTGRES_USER || svcUser;
      svcDb = envObj.POSTGRES_DB || svcDb;
      svcPass = envObj.POSTGRES_PASSWORD || svcPass;
    } catch (err) {
      // ignore
    }

    // Run the command inside the container with the password exported so
    // psql/pg_dump will pick it up. Use sh -c to set the env var for the
    // executed command. Escape single quotes in the password.
    const shEscape = s => `'${String(s).replace(/'/g, "'" + '"' + "'")}'`;
    const dumpCmd = `PGPASSWORD=${svcPass ? shEscape(svcPass) : "''"} pg_dump ${svcUser ? '-U ' + svcUser : ''} ${svcDb ? '-d ' + svcDb : ''}`;
    const args = ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', dumpCmd];

    const child = spawn('docker', args);
    let killed = false;
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (e) {}
      killed = true;
    }, DEFAULT_TIMEOUT_MS);
    child.on('error', e => { /* swallow spawn errors so we can return false */ });
    const outStream = fs.createWriteStream(file, { encoding: 'utf8' });
    child.stdout.pipe(outStream);
    let stderrBuf = '';
    child.stderr.on('data', d => { const s = String(d); stderrBuf += s; process.stderr.write(s); });

    const code = await new Promise((resolve) => {
      child.on('close', (c) => resolve(c));
      outStream.on('finish', () => {
        // nothing extra to do; wait for close event for exit code
      });
      outStream.on('error', () => {
        // ignore write errors here
      });
    });
    clearTimeout(timer);
    try { outStream.end(); } catch (e) {}
    if (killed) return false;
    return code === 0 && stderrBuf.trim().length === 0;
  } catch (err) {
    return false;
  }
}

async function tryDockerRunDump(cfg, pass, file) {
  try {
    const image = 'postgres:17-alpine';
    const args = [
      'run', '--rm',
      '--env', `PGPASSWORD=${pass || ''}`,
      image,
      'pg_dump',
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres'
    ];
    const res = await execa('docker', args, { env: process.env, timeout: DEFAULT_TIMEOUT_MS });
    await fs.writeFile(file, res.stdout, 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

async function saveInContainer(name, opts = {}) {
  ensure();
  const composeFile = await getComposeFilePath();
  if (!await fs.pathExists(composeFile)) throw new Error('compose file not found: ' + composeFile);
  const ps = await execa('docker', ['compose', '-f', composeFile, 'ps', '--services']);
  const services = (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const candidate = services.find(s => /postgres|postgresql|db/i.test(s)) || services[0];
  if (!candidate) throw new Error('No DB service found in compose file');

  // prepare names
  let ext = path.extname(name).toLowerCase();
  let base = name;
  if (ext) base = name.slice(0, -ext.length);
  if (!ext) ext = '.backup';
  const backupPath = `/tmp/${base}.backup`;
  const sqlPath = `/tmp/${base}.sql`;

  // run pg_dump -Fc inside container
  const dumpCmd = `PGPASSWORD=\"$POSTGRES_PASSWORD\" pg_dump -U \"${'$'}{POSTGRES_USER:-postgres}\" -d \"${'$'}{POSTGRES_DB:-postgres}\" -Fc -f ${backupPath}`;
  await execa('docker', ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', dumpCmd], { timeout: DEFAULT_TIMEOUT_MS });

  // get container id for cp
  const cidRes = await execa('docker', ['compose', '-f', composeFile, 'ps', '-q', candidate]);
  const cid = (cidRes.stdout || '').trim();
  if (!cid) throw new Error('Failed to find container id for service: ' + candidate);

  // ensure snapshot dir
  await fs.ensureDir(snapDir);
  const destFile = path.join(snapDir, `${base}.backup`);
  await execa('docker', ['cp', `${cid}:${backupPath}`, destFile]);

  // attempt plain SQL copy inside container and copy out
  try {
    const sqlCmd = `PGPASSWORD=\"$POSTGRES_PASSWORD\" pg_dump -U \"${'$'}{POSTGRES_USER:-postgres}\" -d \"${'$'}{POSTGRES_DB:-postgres}\" -Fp -f ${sqlPath}`;
    await execa('docker', ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', sqlCmd], { timeout: DEFAULT_TIMEOUT_MS });
    const sqlDir = path.join(snapDir, 'sql');
    await fs.ensureDir(sqlDir);
    const destSql = path.join(sqlDir, `${base}.sql`);
    await execa('docker', ['cp', `${cid}:${sqlPath}`, destSql]);
  } catch (e) {
    if (opts.verbose) logger.warn('Failed to create plain SQL copy inside container: ' + (e && e.message ? e.message : String(e)));
  }

  return;
}

async function save(name, opts = {}) {
  // name may include an extension (.sql or .backup). Default to .backup
  ensure();
  const cfg = db.readConfig().db || {};
  const pass = db.loadPassword();
  let ext = path.extname(name).toLowerCase();
  let base = name;
  if (ext) base = name.slice(0, -ext.length);
  if (!ext) ext = '.backup';
  const file = path.join(snapDir, `${base}${ext}`);

  // Choose strategy depending on extension: for .backup use pg_dump -Fc via docker/native
  if (ext === '.backup') {
    const errors = [];
    // If DB mode is internal (containerized), prefer in-container flow
    try {
      const rootCfg = await configManager.readConfig();
      const mode = (rootCfg && rootCfg.db && rootCfg.db.mode) || 'internal';
      if (mode !== 'external') {
        try {
          await saveInContainer(name, opts);
          return;
        } catch (e) {
          errors.push('in-container snapshot failed: ' + (e && e.message ? e.message : String(e)));
          if (opts.verbose) logger.error('in-container snapshot error: ' + (e && (e.stdout || e.stderr || e.message) ? (e.stdout || e.stderr || e.message) : String(e)));
        }
      }
    } catch (e) {
      // ignore config read errors and fall back to other strategies
    }
    // try native pg_dump with -Fc output
    try {
      await execa('pg_dump', [
        '-h', cfg.host || 'localhost',
        '-p', String(cfg.port || 5432),
        '-U', cfg.user || 'postgres',
        '-d', cfg.name || 'postgres',
        '-Fc',
        '-f', file
      ], { env: { ...process.env, PGPASSWORD: pass }, timeout: DEFAULT_TIMEOUT_MS });
      return;
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      errors.push('native pg_dump failed: ' + msg);
      if (opts.verbose) {
        logger.error('native pg_dump stderr/stdout: ' + (e.stderr || e.stdout || msg));
      }
    }

    const composeFile = await getComposeFilePath();
    if (await fs.pathExists(composeFile)) {
      // compose exec dump in custom format
      try {
        const ps = await execa('docker', ['compose', '-f', composeFile, 'ps', '--services']);
        const services = (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const candidate = services.find(s => /postgres|postgresql|db/i.test(s)) || services[0];
        if (candidate) {
          // run pg_dump -Fc inside container
          const shEscape = s => `'${String(s).replace(/'/g, "'" + '"' + "'")}'`;
          const dumpCmd = `PGPASSWORD=${pass ? shEscape(pass) : "''"} pg_dump -Fc -U ${cfg.user || 'postgres'} -d ${cfg.name || 'postgres'} -f /tmp/${base}.backup`;
          const args = ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', dumpCmd + ' && cat /tmp/' + base + '.backup'];
          try {
            const res = await execa('docker', args, { env: process.env, timeout: DEFAULT_TIMEOUT_MS });
            await fs.writeFile(file, res.stdout, 'utf8');
            // attempt to create a plain SQL safety copy using native pg_dump if available
            try {
              const sqlDir = path.join(snapDir, 'sql');
              await fs.ensureDir(sqlDir);
              const plainFile = path.join(sqlDir, `${base}.sql`);
              await tryNativeDumpPlain(cfg, pass, plainFile);
            } catch (e) {
              // ignore failures creating plain SQL copy
            }
            return;
          } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            errors.push('compose exec pg_dump failed: ' + msg);
            if (opts.verbose) {
              logger.error('compose exec pg_dump stdout: ' + (e.stdout || '')); 
              logger.error('compose exec pg_dump stderr: ' + (e.stderr || ''));
            }
          }
        } else {
          errors.push('compose services list empty or no candidate service found');
        }
      } catch (e) {
        errors.push('compose exec discovery failed: ' + (e && e.message ? e.message : String(e)));
      }
    } else {
      errors.push('compose file not found at ' + composeFile);
    }

    // docker run fallback
    try {
      const image = 'postgres:17-alpine';
      const args = [
        'run', '--rm',
        '--env', `PGPASSWORD=${pass || ''}`,
        image,
        'pg_dump',
        '-Fc',
        '-h', cfg.host || 'localhost',
        '-p', String(cfg.port || 5432),
        '-U', cfg.user || 'postgres',
        '-d', cfg.name || 'postgres'
      ];
      const res = await execa('docker', args, { env: process.env, timeout: DEFAULT_TIMEOUT_MS });
      await fs.writeFile(file, res.stdout, 'utf8');
      try {
        const sqlDir = path.join(snapDir, 'sql');
        await fs.ensureDir(sqlDir);
        const plainFile = path.join(sqlDir, `${base}.sql`);
        await tryNativeDumpPlain(cfg, pass, plainFile);
      } catch (e) {}
      return;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      errors.push('docker run pg_dump failed: ' + msg);
      if (opts.verbose) {
        logger.error('docker run pg_dump stdout: ' + (err.stdout || ''));
        logger.error('docker run pg_dump stderr: ' + (err.stderr || ''));
      }
      throw new Error('Failed to create .backup snapshot: ' + errors.join(' | '));
    }
  }

  // default: .sql (plain text)
  if (await tryNativeDump(cfg, pass, file)) return;

      const composeFile = await getComposeFilePath();
      if (await fs.pathExists(composeFile)) {
        if (await tryComposeExecDump(composeFile, cfg, pass, file)) return;
      }

  if (await tryDockerRunDump(cfg, pass, file)) return;

  throw new Error('Failed to create snapshot: no available pg_dump strategy succeeded');
}

async function canBackup() {
  // quick heuristic: is native pg_dump available, or is there a .docker compose with services, or is docker present?
  try {
    await execa('pg_dump', ['--version']);
    return true;
  } catch (e) {
    // ignore
  }
  const composeFile = await getComposeFilePath();
  if (await fs.pathExists(composeFile)) {
    try {
      const ps = await execa('docker', ['compose', '-f', composeFile, 'ps', '--services']);
      if ((ps.stdout || '').trim().length > 0) return true;
    } catch (e) {
      // ignore
    }
  }
  try {
    await execa('docker', ['--version']);
    return true;
  } catch (e) {
    // ignore
  }
  return false;
}

async function tryNativeRestore(cfg, pass, file) {
  try {
    await execa('psql', [
      '-h', cfg.host || 'localhost',
      '-p', String(cfg.port || 5432),
      '-U', cfg.user || 'postgres',
      '-d', cfg.name || 'postgres',
      '-f', file
    ], { env: { ...process.env, PGPASSWORD: pass }, timeout: DEFAULT_TIMEOUT_MS });
    return true;
  } catch (err) {
    return false;
  }
}

async function tryComposeExecRestore(composeFile, cfg, pass, file) {
  try {
    const ps = await execa('docker', ['compose', '-f', composeFile, 'ps', '--services']);
    const services = (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const candidate = services.find(s => /postgres|postgresql|db/i.test(s)) || services[0];
    if (!candidate) return false;

    let svcUser = cfg.user || 'postgres';
    let svcDb = cfg.name || 'postgres';
    let svcPass = pass || '';
    try {
      const envRes = await execa('docker', ['compose', '-f', composeFile, 'exec', '-T', candidate, 'printenv']);
      const envLines = (envRes.stdout || '').split(/\r?\n/);
      const envObj = {};
      for (const line of envLines) {
        const idx = line.indexOf('=');
        if (idx > 0) envObj[line.slice(0, idx)] = line.slice(idx + 1);
      }
      svcUser = envObj.POSTGRES_USER || svcUser;
      svcDb = envObj.POSTGRES_DB || svcDb;
      svcPass = envObj.POSTGRES_PASSWORD || svcPass;
    } catch (err) {
      // ignore
    }

    const basename = path.basename(file);
    if (file.endsWith('.backup')) {
      // copy backup into container and run pg_restore inside container
      try {
        const cidRes = await execa('docker', ['compose', '-f', composeFile, 'ps', '-q', candidate]);
        const cid = (cidRes.stdout || '').trim();
        if (!cid) return false;
        // copy file into container
        await execa('docker', ['cp', file, `${cid}:/tmp/${basename}`]);

        // Try restoring as the container's postgres OS user (no password) first —
        // many official Postgres images allow local socket access for the postgres user.
        try {
          const tryArgs = ['compose', '-f', composeFile, 'exec', '-T', '--user', 'postgres', candidate, 'pg_restore', '-d', svcDb, `/tmp/${basename}`];
          await execa('docker', tryArgs, { env: process.env, timeout: DEFAULT_TIMEOUT_MS });
          // cleanup
          await execa('docker', ['exec', cid, 'rm', '-f', `/tmp/${basename}`]);
          return true;
        } catch (inner) {
          // fallback to using PGPASSWORD if provided
          const shEscape = s => `'${String(s).replace(/'/g, "'" + '"' + "'")}'`;
          const restoreCmd = `PGPASSWORD=${svcPass ? shEscape(svcPass) : "''"} pg_restore -U ${svcUser} -d ${svcDb} /tmp/${basename} && rm -f /tmp/${basename}`;
          const args = ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', restoreCmd];
          const res = await execa('docker', args, { env: process.env, timeout: DEFAULT_TIMEOUT_MS });
          return res.exitCode === 0 || res.stdout !== undefined;
        }
      } catch (e) {
        return false;
      }
    }

    // fallback for plain SQL: use psql via stdin
    const shEscape = s => `'${String(s).replace(/'/g, "'" + '"' + "'")}'`;
    const restoreCmd = `PGPASSWORD=${svcPass ? shEscape(svcPass) : "''"} psql ${svcUser ? '-U ' + svcUser : ''} ${svcDb ? '-d ' + svcDb : ''}`;
    const args = ['compose', '-f', composeFile, 'exec', '-T', candidate, 'sh', '-c', restoreCmd];
    const child = spawn('docker', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    let content = await fs.readFile(file);
    // guard against write errors (EOF) by listening for error events
    child.stdin.on('error', () => {});
    try {
      child.stdin.write(content);
      child.stdin.end();
    } catch (e) {
      // ignore write errors and let the process fail below
    }
    const code = await new Promise((resolve) => child.on('close', resolve));
    return code === 0;
  } catch (err) {
    return false;
  }
}

async function tryDockerRunRestore(cfg, pass, file) {
  try {
      const image = 'postgres:17-alpine';
      const content = await fs.readFile(file);
      if (file.endsWith('.backup')) {
        // use pg_restore reading from stdin (capture output, do not inherit)
        const args = [
          'run', '--rm', '-i',
          '--env', `PGPASSWORD=${pass || ''}`,
          image,
          'pg_restore',
          '-U', cfg.user || 'postgres',
          '-d', cfg.name || 'postgres',
          '-Fc', '-' // read from stdin
        ];
        await execa('docker', args, { input: content, env: process.env, timeout: DEFAULT_TIMEOUT_MS });
        return true;
      }

      const args = [
        'run', '--rm', '-i',
        '--env', `PGPASSWORD=${pass || ''}`,
        image,
        'psql',
        '-h', cfg.host || 'localhost',
        '-p', String(cfg.port || 5432),
        '-U', cfg.user || 'postgres',
        '-d', cfg.name || 'postgres'
      ];
      await execa('docker', args, { input: content, env: process.env, timeout: DEFAULT_TIMEOUT_MS });
      return true;
  } catch (err) {
    return false;
  }
}

async function restore(name) {
  ensure();
  const cfg = db.readConfig().db || {};
  const pass = db.loadPassword();
  // name may include extension (.sql or .backup). If omitted, prefer .backup then .sql
  ensure();
  let ext = path.extname(name).toLowerCase();
  let base = name;
  if (ext) base = name.slice(0, -ext.length);
  const candidates = [];
  if (ext) candidates.push(`${base}${ext}`);
  else {
    // prefer .backup then .sql
    candidates.push(`${base}.backup`, `${base}.sql`);
  }

  const composeFile = await getComposeFilePath();

  for (const candidate of candidates) {
    const file = path.join(snapDir, candidate);
    if (!fs.existsSync(file)) continue;

    // if backup (custom) then use pg_restore via native/compose/docker-run
    if (candidate.endsWith('.backup')) {
      const rootCfg = await configManager.readConfig().catch(() => ({}));
      const mode = (rootCfg && rootCfg.db && rootCfg.db.mode) || 'internal';

      // If project uses internal DB, try compose-exec restore first (avoid printing native errors)
      if (mode !== 'external' && await fs.pathExists(composeFile)) {
        if (await tryComposeExecRestore(composeFile, cfg, pass, file)) return;
      }

      // try native pg_restore (host)
      try {
        await execa('pg_restore', [
          '-h', cfg.host || 'localhost',
          '-p', String(cfg.port || 5432),
          '-U', cfg.user || 'postgres',
          '-d', cfg.name || 'postgres',
          file
        ], { env: { ...process.env, PGPASSWORD: pass }, timeout: DEFAULT_TIMEOUT_MS });
        return;
      } catch (e) {}

      // try compose exec (if not tried above)
      if (await fs.pathExists(composeFile)) {
        if (await tryComposeExecRestore(composeFile, cfg, pass, file)) return;
      }

      // docker run fallback
      if (await tryDockerRunRestore(cfg, pass, file)) return;
      continue;
    }

    // plain .sql: try native psql first, then compose exec, then docker-run
    try {
      await execa('psql', [
        '-h', cfg.host || 'localhost',
        '-p', String(cfg.port || 5432),
        '-U', cfg.user || 'postgres',
        '-d', cfg.name || 'postgres',
        '-f', file
      ], { env: { ...process.env, PGPASSWORD: pass }, stdio: 'inherit' });
      return;
    } catch (err) {}

    if (await fs.pathExists(composeFile)) {
      if (await tryComposeExecRestore(composeFile, cfg, pass, file)) return;
    }

    if (await tryDockerRunRestore(cfg, pass, file)) return;
  }

  throw new Error('Failed to restore snapshot: no available restore strategy succeeded for any candidate');
}

function list() {
  ensure();
  return fs.readdirSync(snapDir).filter(f => f.endsWith('.sql') || f.endsWith('.backup'));
}

module.exports = { save, restore, list, canBackup };

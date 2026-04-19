const inquirer = require('inquirer');
const logger = require('../utils/logger');
const db = require('../utils/dbManager');
const configManager = require('../utils/configManager');
const fs = require('fs-extra');
const path = require('path');
const snapshot = require('../utils/snapshotManager');

module.exports = async function dbCmd(action, arg) {
  if (!action || action === 'help') {
    console.log('Usage: mxtest db connect|status|restore-backup <path>');
    return;
  }

  if (action === 'connect') {
    const cfg = await configManager.readConfig();
    const defaults = {
      host: cfg.dbHost || 'localhost',
      port: cfg.dbPort || 5432,
      user: cfg.dbUser || 'postgres',
      password: cfg.pgadminPassword || ''
    };

    // Prompt only for database name by default, other fields pre-filled from config
    const ans = await inquirer.prompt([
      { name: 'host', message: 'Host:', default: defaults.host },
      { name: 'port', message: 'Port:', default: defaults.port },
      { name: 'name', message: 'Database:' },
      { name: 'user', message: 'User:', default: defaults.user },
      { name: 'password', message: 'Password:', type: 'password', default: defaults.password }
    ]);

    db.saveConfig({ mode: 'external', host: ans.host, port: Number(ans.port), name: ans.name, user: ans.user });
    db.savePassword(ans.password);

    // test connection
    const ok = await db.testConnection({ host: ans.host, port: Number(ans.port), user: ans.user, name: ans.name }, ans.password);
    if (ok) logger.success('DB connection successful');
    else logger.warn('DB connection failed (saved configuration though)');
    return;
  }

  if (action === 'status') {
    const cfg = db.readConfig().db || {};
    const pass = db.loadPassword();
    const ok = await db.testConnection(cfg, pass);

    logger.box(`Mode: ${cfg.mode || 'internal'}\nHost: ${cfg.host || 'db'}\nDB: ${cfg.name || '-'}\nUser: ${cfg.user || '-'}\nStatus: ${ok ? 'Connected' : 'Failed'}`);
    return;
  }

  if (action === 'restore-backup') {
    // Offer to use an existing snapshot in `.mxtest/snapshots` or provide a custom path
    const snapsDir = path.join(process.cwd(), '.mxtest', 'snapshots');
    await fs.ensureDir(snapsDir);
    const existing = (await fs.readdir(snapsDir)).filter(f => f.endsWith('.sql') || f.endsWith('.backup'));

    let chosenPath = null;

    if (!arg && existing.length) {
      const choices = [
        { name: `Use default snapshot: ${existing[0]}`, value: { type: 'use-default', file: existing[0] } },
        { name: 'Choose another existing snapshot', value: { type: 'choose-existing' } },
        { name: 'Provide a custom path', value: { type: 'custom' } },
        { name: 'Cancel', value: { type: 'cancel' } }
      ];

      const ans = await inquirer.prompt([{ type: 'list', name: 'choice', message: 'Restore from snapshot:', choices }]);
      const c = ans.choice;
      if (c.type === 'cancel') return;
      if (c.type === 'use-default') {
        chosenPath = path.join(snapsDir, c.file);
      } else if (c.type === 'choose-existing') {
        const pick = await inquirer.prompt([{ type: 'list', name: 'which', message: 'Select snapshot to restore', choices: existing }]);
        chosenPath = path.join(snapsDir, pick.which);
      } else if (c.type === 'custom') {
        const p = await inquirer.prompt([{ name: 'path', message: 'Path to .backup or .sql file to restore:' }]);
        chosenPath = path.isAbsolute(p.path) ? p.path : path.resolve(process.cwd(), p.path);
      }
    } else {
      // arg provided or no existing snapshots
      if (arg) {
        const maybe = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
        // if arg matches a file in snapsDir by name, offer to use that copy
        const nameOnly = path.basename(maybe);
        if (existing.includes(nameOnly)) {
          const ans = await inquirer.prompt([{ type: 'confirm', name: 'use', message: `Found ${nameOnly} in .mxtest/snapshots — use that copy?`, default: true }]);
          chosenPath = ans.use ? path.join(snapsDir, nameOnly) : maybe;
        } else {
          chosenPath = maybe;
        }
      } else {
        // no arg and no existing snapshots -> prompt for path
        const p = await inquirer.prompt([{ name: 'path', message: 'Path to .backup or .sql file to restore:' }]);
        chosenPath = path.isAbsolute(p.path) ? p.path : path.resolve(process.cwd(), p.path);
      }
    }

    if (!chosenPath) {
      logger.error('No snapshot selected');
      process.exit(1);
    }

    if (!await fs.pathExists(chosenPath)) {
      logger.error('Backup file not found: ' + chosenPath);
      process.exit(1);
    }

    // If chosenPath is outside snapsDir, copy it in
    const destName = path.basename(chosenPath);
    const dest = path.join(snapsDir, destName);
    if (path.normalize(chosenPath) !== path.normalize(dest)) {
      try {
        await fs.copyFile(chosenPath, dest);
        logger.success('Copied backup to ' + dest);
      } catch (err) {
        logger.error('Failed to copy backup: ' + String(err));
        process.exit(1);
      }
    }

    // attempt restore using snapshot manager (it will detect format)
    const spin = require('ora')(`Restoring ${destName} into database...`).start();
    try {
      await snapshot.restore(destName);
      spin.succeed('Restore completed');
    } catch (err) {
      spin.fail('Restore failed');
      logger.error(String(err));
      process.exit(1);
    }
    return;
  }

  console.log('Unknown db action:', action);
};

const snap = require('../utils/snapshotManager');
const logger = require('../utils/logger');
const db = require('../utils/dbManager');
const ui = require('../utils/ui');

module.exports = async function snapshotCmd(action, name, opts = {}) {
  ui.banner('mxtest — snapshot', 'Manage DB snapshots (save, list, restore)');
  if (!action || action === 'help') {
    console.log('Usage: mxtest snapshot save <name> | list | restore <name>');
    return;
  }

  if (action === 'save') {
    if (!name) {
      logger.error('Please provide a snapshot name');
      process.exit(1);
    }
    // default to backup format unless explicit .sql requested
    // Prevent taking backups for external DB mode
    const cfg = db.readConfig().db || {};
    if (cfg.mode === 'external') {
      logger.error('Project DB mode is external; mxtest snapshot save is disabled for external DBs.');
      logger.info('Use your external DB tools to create backups, or run `mxtest db connect` to change mode.');
      process.exit(1);
    }

    await snap.save(name, { verbose: !!(opts && opts.verbose) });
    logger.success('Snapshot saved: ' + name);
    return;
  }

  if (action === 'list') {
    const arr = snap.list();
    if (!arr.length) logger.info('No snapshots');
    else arr.forEach(a => console.log(a));
    return;
  }

  if (action === 'restore') {
    if (!name) {
      logger.error('Please provide a snapshot name');
      process.exit(1);
    }
    await snap.restore(name);
    logger.success('Snapshot restored: ' + name);
    return;
  }
};

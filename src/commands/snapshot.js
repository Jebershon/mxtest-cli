const snap = require('../utils/snapshotManager');
const logger = require('../utils/logger');

module.exports = async function snapshotCmd(action, name) {
  if (!action || action === 'help') {
    console.log('Usage: mxtest snapshot save <name> | list | restore <name>');
    return;
  }

  if (action === 'save') {
    if (!name) {
      logger.error('Please provide a snapshot name');
      process.exit(1);
    }
    await snap.save(name);
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

const inquirer = require('inquirer');
const logger = require('../utils/logger');
const db = require('../utils/dbManager');

module.exports = async function dbCmd(action) {
  if (!action || action === 'help') {
    console.log('Usage: mxtest db connect|status');
    return;
  }

  if (action === 'connect') {
    const ans = await inquirer.prompt([
      { name: 'host', message: 'Host:', default: 'localhost' },
      { name: 'port', message: 'Port:', default: 5432 },
      { name: 'name', message: 'Database:' },
      { name: 'user', message: 'User:', default: 'postgres' },
      { name: 'password', message: 'Password:', type: 'password' }
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

  console.log('Unknown db action:', action);
};

const fs = require('fs-extra');
const path = require('path');
const ui = require('../utils/ui');
const logger = require('../utils/logger');
const validator = require('../utils/validator');
const configManager = require('../utils/configManager');
const dbManager = require('../utils/dbManager');
const runDoctor = require('./doctor');

module.exports = async function init() {
  try {
    // Run full doctor to ensure required tools are present; when called from init we do not want doctor to exit the process
    const ok = await runDoctor({ exitOnFailure: false });
    if (!ok) {
      logger.warn('Doctor reported missing dependencies; init will continue but some features may not work until dependencies are installed');
    }

    // ensure .mpr and other checks are done by doctor; fetch mpr path
    const mpr = await validator.checkMprFile();
    if (!mpr.ok) {
      logger.error('No .mpr found: ' + mpr.message);
      process.exit(1);
    }

    const cfg = await configManager.readConfig();

    // Ensure .mxtest config exists and defaults to internal DB mode
    try {
      const mcfg = dbManager.readConfig();
      logger.info(`Ensured .mxtest config (DB mode: ${mcfg.db && mcfg.db.mode ? mcfg.db.mode : 'internal'})`);
    } catch (e) {
      logger.warn('Could not create .mxtest config: ' + String(e));
    }

    // Persist static PGAdmin and DB defaults into mxtest config so later commands can assume them
    const updates = {};
    if (!cfg.pgadminUrl) updates.pgadminUrl = 'http://localhost:5050';
    if (!cfg.pgadminUser) updates.pgadminUser = 'root';
    if (!cfg.pgadminPassword) updates.pgadminPassword = 'root';
    if (!cfg.dbHost) updates.dbHost = 'localhost';
    if (!cfg.dbPort) updates.dbPort = cfg.postgresPort || 5432;
    if (!cfg.dbUser) updates.dbUser = 'postgres';
    if (Object.keys(updates).length > 0) {
      await configManager.updateConfig(updates);
      logger.success('Saved default DB and pgAdmin settings to mxtest.config.json');
    } else {
      logger.info('DB and pgAdmin settings already present in config');
    }

    // create tests dir inside .mxtest by default to avoid touching project files
    const defaultTestsRel = '.mxtest/tests';
    const testsDirRel = cfg.testDir || defaultTestsRel;
    const testsDir = path.resolve(process.cwd(), testsDirRel);
    if (!await fs.pathExists(testsDir)) {
      const spin = ui.startSpinner(`Creating tests directory at ${testsDir}`);
      await fs.mkdirp(testsDir);
      spin.succeed('Created tests directory');
      logger.success(`Created ${testsDir}`);
      // if user had no testDir in config, persist the new location
      if (!cfg.testDir) {
        try {
          await configManager.updateConfig({ testDir: defaultTestsRel });
          logger.info(`Saved testDir = ${defaultTestsRel} to mxtest.config.json`);
        } catch (e) {
          logger.warn('Failed to persist testDir to config: ' + String(e));
        }
      }
    } else {
      logger.info(`Tests directory already exists: ${testsDir}`);
    }

    // create sample.spec.js inside testsDir
    const sampleSrc = path.join(__dirname, '..', 'templates', 'sample.spec.js.txt');
    const sampleDest = path.join(testsDir, 'sample.spec.js');
    if (!await fs.pathExists(sampleDest)) {
      const spin = ui.startSpinner('Creating sample.spec.js');
      const content = await fs.readFile(sampleSrc, 'utf8');
      await fs.writeFile(sampleDest, content, 'utf8');
      spin.succeed('Created sample.spec.js');
      logger.success(`Created ${sampleDest}`);
    } else {
      logger.info('sample.spec.js already exists, skipping');
    }

    // update config with mprFile
    if (!cfg.mprFile) {
      await configManager.updateConfig({ mprFile: mpr.file });
      logger.success('Saved mprFile to config');
    } else {
      logger.info('mxtest.config.json already contains mprFile');
    }

    logger.box('Initialization complete', { borderColor: 'green' });
  } catch (err) {
    logger.error('Init failed: ' + String(err));
    process.exit(1);
  }
};
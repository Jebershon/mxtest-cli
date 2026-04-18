const path = require('path');
const fs = require('fs-extra');

const CONFIG_FILE = path.join(process.cwd(), 'mxtest.config.json');

async function readConfig() {
  try {
    const exists = await fs.pathExists(CONFIG_FILE);
    if (!exists) {
      // create default
      const def = {
        version: '1',
        testDir: './tests',
        appUrl: 'http://localhost:8080',
        clientPort: 8080,
        postgresPort: 5432,
        mprFile: null,
        dockerDir: '.docker',
        reportDir: './test-results',
        waitTimeout: 120,
        waitRetries: 30,
        waitDelay: 2000
      };
      await fs.writeJson(CONFIG_FILE, def, { spaces: 2 });
      return def;
    }
    const cfg = await fs.readJson(CONFIG_FILE);
    return cfg;
  } catch (err) {
    throw err;
  }
}

async function writeConfig(cfg) {
  await fs.writeJson(CONFIG_FILE, cfg, { spaces: 2 });
  return cfg;
}

async function updateConfig(updates) {
  const cfg = await readConfig();
  const merged = Object.assign({}, cfg, updates);
  await writeConfig(merged);
  return merged;
}

async function getConfigValue(key) {
  const cfg = await readConfig();
  return cfg[key];
}

module.exports = {
  readConfig,
  writeConfig,
  updateConfig,
  getConfigValue,
  CONFIG_FILE
};

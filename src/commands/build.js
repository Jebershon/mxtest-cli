const path = require('path');
const fs = require('fs-extra');
const ora = require('ora');
const execa = require('execa');
const logger = require('../utils/logger');
const validator = require('../utils/validator');
const configManager = require('../utils/configManager');

module.exports = async function build(clientPort, postgresPort) {
  try {
    // validate
    const mx = await validator.checkMxcli();
    if (!mx.ok) {
      logger.error(mx.message);
      process.exit(1);
    }
    const docker = await validator.checkDocker();
    if (!docker.ok) {
      logger.error(docker.message);
      process.exit(1);
    }

    const cfg = await configManager.readConfig();
    const mpr = await validator.checkMprFile(cfg.mprFile);
    if (!mpr.ok) {
      logger.error(mpr.message);
      process.exit(1);
    }

    // run mxcli docker build -p <mpr>
    const spinBuild = ora('Running mxcli docker build...').start();
    try {
      await execa('mxcli', ['docker', 'build', '-p', mpr.file]);
      spinBuild.succeed('mxcli docker build completed');
    } catch (err) {
      spinBuild.fail('mxcli docker build failed');
      logger.error(String(err));
      process.exit(1);
    }

    // ensure .docker exists
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    await fs.ensureDir(dockerDir);

    // create .env if missing
    const envDest = path.join(dockerDir, '.env');
    if (!await fs.pathExists(envDest)) {
      const template = await fs.readFile(path.join(__dirname, '..', 'templates', '.env.txt'), 'utf8');
      const content = template.replace(/{{CLIENT_PORT}}/g, String(clientPort || cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(postgresPort || cfg.postgresPort || 5432));
      await fs.writeFile(envDest, content, 'utf8');
      logger.success('Created .env in docker dir');
    }

    // create docker-compose.yml if missing
    const composeDest = path.join(dockerDir, 'docker-compose.yml');
    if (!await fs.pathExists(composeDest)) {
      const tmpl = await fs.readFile(path.join(__dirname, '..', 'templates', 'docker-compose.yml.txt'), 'utf8');
      const content = tmpl.replace(/{{CLIENT_PORT}}/g, String(clientPort || cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(postgresPort || cfg.postgresPort || 5432));
      await fs.writeFile(composeDest, content, 'utf8');
      logger.success('Created docker-compose.yml in docker dir');
    }

    // save ports to config
    await configManager.updateConfig({ clientPort: Number(clientPort) || cfg.clientPort, postgresPort: Number(postgresPort) || cfg.postgresPort });

    // docker compose up -d
    const spinUp = ora('Starting docker compose...').start();
    try {
      await execa('docker', ['compose', 'up', '-d'], { cwd: dockerDir });
      spinUp.succeed('Docker compose started');
    } catch (err) {
      spinUp.fail('docker compose up failed');
      logger.error(String(err));
      process.exit(1);
    }

    // wait for app
    const waitForApp = require('../utils/waitForApp');
    const appUrl = cfg.appUrl || 'http://localhost:8080';
    const spinWait = ora(`Waiting for app at ${appUrl}`).start();
    try {
      await waitForApp(appUrl, cfg.waitRetries || 30, cfg.waitDelay || 2000, cfg.waitTimeout || 120);
      spinWait.succeed('App is available');
      logger.box(`Application available at ${appUrl}`, { borderColor: 'green' });
    } catch (err) {
      spinWait.fail('App did not become available');
      logger.error(String(err) + '\nTry checking docker logs or increase waitTimeout in config');
      process.exit(1);
    }

  } catch (err) {
    logger.error('Build failed: ' + String(err));
    process.exit(1);
  }
};

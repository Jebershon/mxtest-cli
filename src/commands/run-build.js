const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');
const ora = require('ora');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const waitForApp = require('../utils/waitForApp');
const buildCmd = require('./build');

module.exports = async function runBuild(opts = {}) {
  try {
    const cfg = await configManager.readConfig();
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    const composePath = path.join(dockerDir, 'docker-compose.yml');

    // If .docker exists, attempt to gracefully stop any running compose stack
    // that was created from it before removing the folder. This avoids the
    // situation where old containers/images remain and interfere with the
    // new build. If a docker-compose.yml exists in .docker, run `docker
    // compose down -v --rmi local` first. Then remove the directory.
    if (await fs.pathExists(dockerDir)) {
      const existingCompose = path.join(dockerDir, 'docker-compose.yml');
      if (await fs.pathExists(existingCompose)) {
        logger.info('Detected existing .docker/docker-compose.yml — attempting to stop previous stack');
        const spinDownOld = ora('Stopping previous docker compose stack (down -v --rmi local)...').start();
        try {
          // try best-effort to stop and remove local images
          await execa('docker', ['compose', 'down', '-v', '--rmi', 'local'], { cwd: dockerDir, stdio: 'inherit' });
          spinDownOld.succeed('Previous compose stack stopped and local images removed');
        } catch (err) {
          spinDownOld.fail('Failed to fully stop previous compose stack — continuing with rebuild');
          logger.warn(String(err));
        }
      }

      logger.info('Removing existing .docker to ensure fresh build artifacts');
      const spinRm = ora('Removing existing .docker...').start();
      try {
        await fs.remove(dockerDir);
        spinRm.succeed('Removed existing .docker');
      } catch (err) {
        spinRm.fail('Failed to remove existing .docker');
        logger.error(String(err));
        process.exit(1);
      }
    }

    // Run build (this will run mxcli and recreate .docker)
    // Do not show an ora spinner here — mxcli streams its own output and a spinner would interleave with it.
    try {
      await buildCmd();
      logger.success('Build completed');
    } catch (err) {
      logger.error('Build failed: ' + String(err));
      process.exit(1);
    }

    // Ensure compose file exists
    if (!require('fs').existsSync(composePath)) {
      logger.error('.docker/docker-compose.yml not found after build. Aborting.');
      process.exit(1);
    }

      // Detect whether mxcli produced Docker artifacts. mxcli can place
      // artifacts in several locations; be flexible and look recursively for
      // either a Dockerfile or any YAML (Default.yaml / Default.yml) that
      // represents docker-compose fragments. Also accept YAML files placed
      // directly under `.docker`.
      const buildOutputDir = path.join(dockerDir, 'build');

      // simple recursive search helper
      async function containsMatchingFile(startDir, predicate) {
        try {
          const entries = await fs.readdir(startDir);
          for (const e of entries) {
            const p = path.join(startDir, e);
            try {
              const st = await fs.stat(p);
              if (st.isFile()) {
                if (predicate(e, p)) return true;
              } else if (st.isDirectory()) {
                if (await containsMatchingFile(p, predicate)) return true;
              }
            } catch (inner) {
              // ignore stat errors for individual files
            }
          }
        } catch (err) {
          // directory may not exist — treat as not found
          return false;
        }
        return false;
      }

      const hasDockerfile = await containsMatchingFile(buildOutputDir, (name) => /^dockerfile$/i.test(name));
      // check for any yaml anywhere under .docker (build outputs sometimes land there)
      const hasYaml = await containsMatchingFile(dockerDir, (name) => /\.ya?ml$/i.test(name));

      if (!hasDockerfile && !hasYaml) {
        // No mxcli docker artifacts were produced. Abort before attempting `docker compose up` which will try to pull a non-existent image.
        logger.error('No Docker artifacts were produced by mxcli (no Dockerfile or docker-compose YAML found under .docker).');
        logger.info('Either enable Docker output in your Mendix project/mxcli, or provide a prebuilt image in mxtest.config.json/docker-compose.');
        logger.info('Skipping docker compose up to avoid pulling a missing image.');
        process.exit(1);
      }

    // Check if compose currently has running containers; if so, take them down
    const spinCheck = ora('Checking for existing docker compose containers...').start();
    let running = false;
    try {
      const ps = await execa('docker', ['compose', 'ps', '-q'], { cwd: dockerDir });
      const out = (ps && ps.stdout) ? String(ps.stdout).trim() : '';
      running = out.length > 0;
      spinCheck.succeed(running ? 'Found running containers' : 'No running containers');
    } catch (err) {
      spinCheck.fail('Failed to check docker compose status');
      logger.warn(String(err));
      // continue — we can still try to run down/up
    }

    if (running) {
      const spinDown = ora('Stopping existing docker compose (down -v)...').start();
      try {
        await execa('docker', ['compose', 'down', '-v'], { cwd: dockerDir });
        spinDown.succeed('Previous compose stopped');
      } catch (err) {
        spinDown.fail('docker compose down failed');
        logger.warn(String(err));
        // continue to up attempt
      }
    }

    // If a Dockerfile exists, ensure the compose file prefers a local build
    // (so docker won't try to pull an image). Then, when Dockerfile or
    // YAML are present, run `docker compose build` to build local images.
    if (hasDockerfile) {
      try {
        let composeText = await fs.readFile(composePath, 'utf8');
        if (!/^[ \t]*build:/im.test(composeText) && /^[ \t]*image:/im.test(composeText)) {
          composeText = composeText.replace(/(^[ \t]*)(image:\s*([^\r\n]+))/im, (m, indent, whole, img) => {
            const imageName = String(img).replace(/^image:\s*/i, '').trim();
            const buildBlock = `${indent}build:\n${indent}  context: ./build\n${indent}  dockerfile: Dockerfile\n${indent}image: ${imageName}`;
            return buildBlock;
          });
          await fs.writeFile(composePath, composeText, 'utf8');
          logger.info('Updated docker-compose.yml to prefer local build context (./build) to avoid image pulls');
        }
      } catch (err) {
        logger.warn('Failed to rewrite docker-compose to use local build: ' + String(err));
      }
    }

    if (hasDockerfile || hasYaml) {
      logger.info('Local Docker artifacts detected — running `docker compose build` to create images locally');
      try {
        await execa('docker', ['compose', 'build'], { cwd: dockerDir, stdio: 'inherit' });
      } catch (err) {
        logger.error('docker compose build failed: ' + String(err));
        process.exit(1);
      }
    }

    // Now bring the new build up
    const spinUp = ora('Starting docker compose (up -d)...').start();
    try {
      await execa('docker', ['compose', 'up', '-d'], { cwd: dockerDir });
      spinUp.succeed('Docker compose started');
    } catch (err) {
      spinUp.fail('docker compose up failed');
      if (err.stderr) logger.error('docker compose stderr:\n' + String(err.stderr));
      if (err.stdout) logger.info('docker compose stdout:\n' + String(err.stdout));
      // Detect image pull access denied and show actionable message
      const stderr = (err.stderr) ? String(err.stderr) : '';
      if (/pull access denied for (\S+)/i.test(stderr)) {
        const m = stderr.match(/pull access denied for (\S+)/i);
        const image = m ? m[1] : null;
        logger.error('docker compose failed because it could not pull image' + (image ? (': ' + image) : '') + '.');
        logger.info('Possible fixes:');
        logger.info('- `docker login` to a registry that hosts the image');
        logger.info("- Set a valid image in your project's `mxtest.config.json` (key: 'image') and re-run `mxtest build`");
        logger.info('- Or configure your Mendix/mxcli build to produce Docker artifacts (Dockerfile/docker_compose) so the CLI can build the image locally');
      } else {
        logger.error(String(err));
      }
      process.exit(1);
    }

    if (opts.noWait) {
      logger.info('Skipping wait for application (user requested --no-wait)');
      return;
    }

    // Wait for app to be available
    const appUrl = cfg.appUrl || 'http://localhost:8080';
    const spinWait = ora(`Waiting for app at ${appUrl}`).start();
    try {
      await waitForApp(appUrl, cfg.waitRetries || 30, cfg.waitDelay || 2000, cfg.waitTimeout || 120);
      spinWait.succeed('App is available');
      logger.box(`Application available at ${appUrl}`, { borderColor: 'green' });
      logger.success(appUrl);
    } catch (err) {
      spinWait.fail('App did not become available');
      logger.error(String(err));
      process.exit(1);
    }

  } catch (err) {
    logger.error('run-build failed: ' + String(err));
    process.exit(1);
  }
};

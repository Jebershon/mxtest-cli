const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');
const logger = require('../utils/logger');
const configManager = require('../utils/configManager');
const waitForApp = require('../utils/waitForApp');
const buildCmd = require('./build');
const dbManager = require('../utils/dbManager');
const snapshot = require('../utils/snapshotManager');
const ui = require('../utils/ui');
const orchestrator = require('../utils/snapshotOrchestrator');

module.exports = async function runBuild(opts = {}) {
  try {
    const cfg = await configManager.readConfig();
    ui.banner('mxtest — run-build', 'Rebuild and start the app (baseline snapshot will be preserved when possible)');
    const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
    const composePath = path.join(dockerDir, 'docker-compose.yml');

    // If .docker exists, attempt to gracefully stop any running compose stack
    // that was created from it before removing the folder. This avoids the
    // situation where old containers/images remain and interfere with the
    // new build. If a docker-compose.yml exists in .docker, run `docker
    // compose down -v --rmi local` first. Then remove the directory.
    // If DB mode is internal and this is NOT the first run (i.e. .docker
    // already exists), create a baseline snapshot before taking the stack
    // down so we can restore data into the new DB image after rebuild.
    const dbCfgEarly = dbManager.readConfig().db || {};
    const isInternal = !dbCfgEarly.mode || dbCfgEarly.mode === 'internal';

    let baselineSaved = false;
    if (opts && opts.skipSnapshot) {
      logger.info('Skipping baseline snapshot (already handled by parent command)');
    } else {
      baselineSaved = await orchestrator.saveBaselineIfNeeded(dockerDir, opts);
    }

    if (await fs.pathExists(dockerDir)) {
      const existingCompose = path.join(dockerDir, 'docker-compose.yml');
      if (await fs.pathExists(existingCompose)) {
        logger.info('Detected existing .docker/docker-compose.yml — attempting to stop previous stack');
        const spinDownOld = ui.startSpinner('Stopping previous docker compose stack (down -v --rmi local)...');
        try {
          // try best-effort to stop and remove local images
          await execa('docker', ['compose', 'down', '-v', '--rmi', 'local'], { cwd: dockerDir, stdio: 'inherit' });
          spinDownOld.succeed('Previous compose stack stopped and local images removed');
        } catch (err) {
          spinDownOld.fail('Failed to fully stop previous compose stack — continuing with rebuild');
          logger.warn(String(err));
        }
      }

      if (baselineSaved || (opts && opts.force)) {
        if (opts && opts.force && !baselineSaved) logger.warn('Force flag set — removing .docker despite snapshot failure');
        logger.info('Removing existing .docker to ensure fresh build artifacts');
        const spinRm = ui.startSpinner('Removing existing .docker...');
        try {
          await fs.remove(dockerDir);
          spinRm.succeed('Removed existing .docker');
        } catch (err) {
          spinRm.fail('Failed to remove existing .docker');
          logger.error(String(err));
          process.exit(1);
        }
      } else {
        logger.info('Skipping removal of existing .docker because baseline snapshot failed. Existing artifacts will be preserved. Use --force to override.');
      }
    }

    // Run build (this will run mxcli and recreate .docker). Tell build to
    // skip snapshot because we already handled baseline snapshot in this flow.
    // Do not show an ora spinner here — mxcli streams its own output and a spinner would interleave with it.
    try {
      await buildCmd(undefined, undefined, { skipSnapshot: true, noExit: true, suppressRunHint: true });
      logger.success('Build completed');
    } catch (err) {
      logger.error('Build failed: ' + String(err));
      process.exit(1);
    }

    // Ensure compose file exists; if build didn't produce it, attempt to generate defaults from templates
    if (!require('fs').existsSync(composePath)) {
      logger.warn('.docker/docker-compose.yml not found after build. Attempting to generate from templates as a fallback.');
      try {
        await fs.ensureDir(dockerDir);
        // create .env if missing
        const envDest = path.join(dockerDir, '.env');
        if (!await fs.pathExists(envDest)) {
          const template = await fs.readFile(path.join(__dirname, '..', 'templates', '.env.txt'), 'utf8');
          const content = template.replace(/{{CLIENT_PORT}}/g, String(cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(cfg.postgresPort || 5432));
          await fs.writeFile(envDest, content, 'utf8');
          logger.info('Wrote fallback .env into .docker');
        }

        // create docker-compose.yml from template
        const tmpl = await fs.readFile(path.join(__dirname, '..', 'templates', 'docker-compose.yml.txt'), 'utf8');
        const image = (cfg && cfg.image) ? String(cfg.image) : 'mendix/custom-app:latest';
        let content = tmpl.replace(/{{CLIENT_PORT}}/g, String(cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(cfg.postgresPort || 5432));
        // if there's a build output, prefer build block
        const buildOutputDir = path.join(dockerDir, 'build');
        const dockerfilePath = path.join(buildOutputDir, 'Dockerfile');
        const hasDockerfile = await fs.pathExists(dockerfilePath);
        if (hasDockerfile) {
          const buildBlock = `build:\n      context: ./build\n      dockerfile: Dockerfile\n    image: ${image}`;
          content = content.replace(/image: {{IMAGE}}/g, buildBlock);
        } else {
          content = content.replace(/{{IMAGE}}/g, image);
        }
        await fs.writeFile(composePath, content, 'utf8');
        logger.info('Wrote fallback docker-compose.yml into .docker');
      } catch (err) {
        logger.error('.docker/docker-compose.yml not found after build and fallback generation failed. Aborting.');
        logger.error(String(err));
        process.exit(1);
      }
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

    // Verify Docker daemon availability before attempting compose operations.
    let dockerAvailable = true;
    try {
      await execa('docker', ['info']);
    } catch (err) {
      dockerAvailable = false;
    }

    if (!dockerAvailable && !opts.resume) {
      // Create a pending marker so the user can resume later after starting Docker
      try {
        await fs.ensureDir(dockerDir);
        const pendingPath = path.join(dockerDir, '.mxtest.pending');
        const now = new Date().toISOString();
        await fs.writeFile(pendingPath, `pending at ${now}\n`, 'utf8');
        logger.warn('Docker daemon not reachable. Generated .docker artifacts but skipped `docker compose` steps.');
        logger.info('Start Docker Desktop, then run: `mxtest run-build --resume` or `mxtest run` to continue.');
        return;
      } catch (err) {
        logger.error('Docker not available and failed to write pending marker: ' + String(err));
        process.exit(1);
      }
    }

    // If resume was requested but docker is still unavailable, fail fast
    if (!dockerAvailable && opts.resume) {
      logger.error('Resume requested but Docker daemon is still not reachable. Start Docker and try again.');
      process.exit(1);
    }

    // Check if compose currently has running containers; if so, take them down
    const spinCheck = ui.startSpinner('Checking for existing docker compose containers...');
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
      const spinDown = ui.startSpinner('Stopping existing docker compose (down -v)...');
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

    // Prepare docker-compose up arguments. If project is configured to use
    // an external database, create a small override file to inject DB env
    // values into the Mendix service and avoid starting the local `db`
    // service by scaling it to 0.
    const dbCfg = dbManager.readConfig().db || {};
    const upArgsBase = ['compose', 'up', '-d'];
    let upCwd = dockerDir;
    let extraEnv = { ...process.env };
    let extraArgs = [];

    if (dbCfg.mode === 'external') {
      // write an override compose file that injects runtime DB params into
      // the mendix service so it connects to the external DB. We will also
      // scale the local db service to 0 to avoid starting it.
      const overridePath = path.join(dockerDir, 'docker-compose.mxtest.override.yml');
      const host = dbCfg.host || 'localhost';
      const port = dbCfg.port || 5432;
      const name = dbCfg.name || 'mendix';
      const user = dbCfg.user || 'mendix';
      const pass = dbManager.loadPassword();
      const override = `services:\n  mendix:\n    environment:\n      - RUNTIME_PARAMS_DATABASEHOST=${host}:${port}\n      - RUNTIME_PARAMS_DATABASENAME=${name}\n      - RUNTIME_PARAMS_DATABASEUSERNAME=${user}\n      - RUNTIME_PARAMS_DATABASEPASSWORD=${pass}\n`;
      try {
        await fs.writeFile(overridePath, override, 'utf8');
        extraArgs = ['-f', 'docker-compose.yml', '-f', 'docker-compose.mxtest.override.yml', '--scale', 'db=0'];
        // ensure env contains DB values for any other use-cases
        extraEnv = { ...extraEnv, POSTGRES_HOST: host, POSTGRES_PORT: String(port), POSTGRES_DB: name, POSTGRES_USER: user, POSTGRES_PASSWORD: pass };
        logger.info('Using external DB configuration; wrote temporary compose override to avoid starting local postgres');
      } catch (err) {
        logger.warn('Failed to write docker-compose override: ' + String(err));
      }
    }

    // Now bring the new build up
    const spinUp = ui.startSpinner('Starting docker compose (up -d)...');
    try {
      const upArgs = upArgsBase.concat(extraArgs.length ? extraArgs : []);
      await execa('docker', upArgs, { cwd: upCwd, stdio: 'inherit', env: extraEnv });
      spinUp.succeed('Docker compose started');
      // If internal DB mode and baseline snapshot exists, restore it into
      // the newly started DB so the rebuilt app has previous data.
      try {
        const dbCfgNow = dbManager.readConfig().db || {};
        const isInternalNow = !dbCfgNow.mode || dbCfgNow.mode === 'internal';
        if (isInternalNow) {
            const snaps = snapshot.list();
            const baselineFile = snaps.find(s => require('path').parse(s).name === 'baseline');
            if (baselineFile) {
              try {
                await orchestrator.restoreBaselineIfPresent(composePath, dockerDir);
              } catch (err) {
                logger.warn('Baseline restore failed: ' + String(err));
              }
            }
        }
      } catch (e) {
        logger.warn('Snapshot restore check failed: ' + String(e));
      }
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
    const spinWait = ui.startSpinner(`Waiting for app at ${appUrl}`);
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

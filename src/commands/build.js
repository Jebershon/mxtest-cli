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

        // Always run mxcli build and overwrite the .docker directory with the latest artifacts
        const dockerDir = path.join(process.cwd(), cfg.dockerDir || '.docker');
        const composeDest = path.join(dockerDir, 'docker-compose.yml');

        const mpr = await validator.checkMprFile(cfg.mprFile);
        if (!mpr.ok) {
            logger.error(mpr.message);
            process.exit(1);
        }

        // Show an ASCII banner to indicate a longer build is starting
        logger.box(`mxtest — building Mendix package
This may take several minutes. Sit back and relax!`, { borderColor: 'yellow' });

        // If .docker exists from a previous run, remove it first so mxcli produces a fresh set
        try {
            if (await fs.pathExists(dockerDir)) {
                logger.info('Removing existing .docker before running mxcli to ensure a fresh artifact set');
                await fs.remove(dockerDir);
            }
        } catch (err) {
            logger.warn('Failed to remove existing .docker before build: ' + String(err));
        }

    // Run mxcli docker build -p <mpr> and stream output to the console while capturing it.
    // We stream mxcli stdout/stderr directly; avoid additional progress output to prevent duplication.
    logger.info('Running mxcli docker build...');
        const { spawn } = require('child_process');
        let combined = '';
        // (No ASCII loader) Stream mxcli output directly to the console while capturing it.
        try {
            await new Promise((resolve, reject) => {
                const child = spawn('mxcli', ['docker', 'build', '-p', mpr.file], { shell: true });

                child.stdout.on('data', (d) => { process.stdout.write(d); combined += String(d); });
                child.stderr.on('data', (d) => { process.stderr.write(d); combined += String(d); });
                child.on('error', (e) => {
                    process.stderr.write('\n');
                    reject(e);
                });
                child.on('close', (code) => {
                    process.stderr.write('\n');
                    if (code === 0) return resolve();
                    // if code non-zero but output declares success, treat as success
                    if (combined.includes('BUILD SUCCEEDED') || /BUILD\s+SUCCEEDED/i.test(combined)) return resolve();
                    const err = new Error('mxcli exited with code ' + code);
                    err.code = code;
                    err.output = combined;
                    return reject(err);
                });
            });
            logger.success('mxcli docker build completed');
        } catch (err) {
            // print combined output if available to help debugging
            if (err && err.output) logger.error('mxcli output:\n' + String(err.output));
            logger.error(String(err));
            process.exit(1);
        }

        // Ensure .docker exists (mxcli should have created artifacts). If not, create directory.
        try {
            await fs.ensureDir(dockerDir);
        } catch (err) {
            logger.error('Failed to prepare .docker directory: ' + String(err));
            process.exit(1);
        }

        // create .env if missing
        const envDest = path.join(dockerDir, '.env');
        if (!await fs.pathExists(envDest)) {
            const template = await fs.readFile(path.join(__dirname, '..', 'templates', '.env.txt'), 'utf8');
            const content = template.replace(/{{CLIENT_PORT}}/g, String(clientPort || cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(postgresPort || cfg.postgresPort || 5432));
            await fs.writeFile(envDest, content, 'utf8');
            logger.success('Created .env in docker dir');
        }

        // create docker-compose.yml if missing. Inject IMAGE from config if provided.
        if (!await fs.pathExists(composeDest)) {
            const tmpl = await fs.readFile(path.join(__dirname, '..', 'templates', 'docker-compose.yml.txt'), 'utf8');
            const image = (cfg && cfg.image) ? String(cfg.image) : 'mendix/custom-app:latest';
            let content = tmpl.replace(/{{CLIENT_PORT}}/g, String(clientPort || cfg.clientPort || 8080)).replace(/{{POSTGRES_PORT}}/g, String(postgresPort || cfg.postgresPort || 5432));

            // If mxcli produced a Dockerfile in .docker/build, prefer a compose that builds locally (so we don't try to pull a remote image)
            const buildOutputDir = path.join(dockerDir, 'build');
            const dockerfilePath = path.join(buildOutputDir, 'Dockerfile');
            const hasDockerfile = await fs.pathExists(dockerfilePath);
            if (hasDockerfile) {
                // inject build context into the compose so `docker compose build` will build the local image
                const buildBlock = `build:\n      context: ./build\n      dockerfile: Dockerfile\n    image: ${image}`;
                content = content.replace(/image: {{IMAGE}}/g, buildBlock);
            } else {
                content = content.replace(/{{IMAGE}}/g, image);
            }

            await fs.writeFile(composeDest, content, 'utf8');
            logger.success('Created docker-compose.yml in docker dir (image/build: ' + image + ')');
        } else {
            logger.info('Using existing docker-compose.yml from .docker');
        }

        // save ports to config
        await configManager.updateConfig({ clientPort: Number(clientPort) || cfg.clientPort, postgresPort: Number(postgresPort) || cfg.postgresPort });

        logger.success('Docker artifacts prepared in ' + dockerDir);
        logger.info('Run `mxtest run` to start the prepared Docker compose and wait for the application to become available.');

    } catch (err) {
        logger.error('Build failed: ' + String(err));
        process.exit(1);
    }
};

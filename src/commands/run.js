const execa = require('execa');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');

const APP_URL = 'http://localhost:8080';

module.exports = async (options = {}) => {
  const spinner = ora();

  try {
    // 🔹 1. Validate mxcli
    spinner.start('Checking mxcli...');
    await execa('mxcli', ['--version']);
    spinner.succeed('mxcli found');

    // 🔹 2. Validate Docker
    spinner.start('Checking Docker...');
    await execa('docker', ['--version']);
    spinner.succeed('Docker found');

    // 🔹 3. Validate Mendix project
    spinner.start('Checking Mendix project...');
    const files = fs.readdirSync(process.cwd());
    const mprFile = files.find(f => f.endsWith('.mpr'));

    if (!mprFile) {
      throw new Error('No .mpr file found. Run inside Mendix project folder.');
    }
    spinner.succeed(`Found ${mprFile}`);

    // 🔹 4. Build Docker image
    spinner.start('Building Docker image (mxcli)...');
    await execa('mxcli', ['docker', 'build', '-p', mprFile], {
      stdio: 'inherit'
    });
    spinner.succeed('Docker image built');

    const dockerDir = path.join(process.cwd(), '.docker');

    if (!fs.existsSync(dockerDir)) {
      throw new Error('.docker folder not found after build.');
    }

    // 🔹 5. Create .env if not exists
    const envPath = path.join(dockerDir, '.env');

    if (!fs.existsSync(envPath)) {
      spinner.start('Creating .env file...');
      const envContent = `
MXRUNTIME_Port=8080
MXRUNTIME_ApplicationRootUrl=${APP_URL}
`;
      await fs.writeFile(envPath, envContent.trim());
      spinner.succeed('.env created');
    } else {
      spinner.info('.env already exists (skipped)');
    }

    // 🔹 6. Create docker-compose.yml if not exists
    const yamlPath = path.join(dockerDir, 'docker-compose.yml');

    if (!fs.existsSync(yamlPath)) {
      spinner.start('Creating docker-compose.yml...');

      const yamlContent = `
version: '3.8'
services:
  mendix-app:
    image: mendix-app
    ports:
      - "8080:8080"
    env_file:
      - .env
`;

      await fs.writeFile(yamlPath, yamlContent.trim());
      spinner.succeed('docker-compose.yml created');
    } else {
      spinner.info('docker-compose.yml already exists (skipped)');
    }

    // 🔹 7. Start Docker container
    spinner.start('Starting Docker container...');
    await execa('docker', ['compose', 'up', '-d'], {
      cwd: dockerDir,
      stdio: 'inherit'
    });
    spinner.succeed('Container started');

    // 🔹 8. Wait for app readiness
    spinner.start('Waiting for app to be ready...');
    await waitForApp(APP_URL);
    spinner.succeed('App is ready');

    // 🔹 9. Run Playwright tests
    spinner.start('Running Playwright tests...');
    await execa('npx', ['playwright', 'test'], {
      stdio: 'inherit'
    });
    spinner.succeed('Tests completed');

  } catch (err) {
    spinner.fail(chalk.red(err.message));
  } finally {
    // 🔹 10. Cleanup (unless keep flag)
    if (!options.keepDocker) {
      const dockerDir = path.join(process.cwd(), '.docker');

      console.log(chalk.yellow('\nStopping Docker container...'));

      try {
        await execa('docker', ['compose', 'down'], {
          cwd: dockerDir,
          stdio: 'inherit'
        });
        console.log(chalk.green('Docker stopped'));
      } catch (e) {
        console.log(chalk.red('Failed to stop Docker'));
      }
    } else {
      console.log(chalk.blue('Keeping Docker container running'));
    }
  }
};



// 🔥 Wait for Mendix app to be ready
async function waitForApp(url, retries = 30, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url);
      return;
    } catch (err) {
      await new Promise(res => setTimeout(res, delay));
    }
  }

  throw new Error('App did not become ready in time');
}
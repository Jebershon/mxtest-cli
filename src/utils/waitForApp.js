const axios = require('axios');
const cliProgress = require('cli-progress');
const logger = require('./logger');

async function waitForApp(url, retries = 30, delay = 2000, timeoutSeconds = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const bar = new cliProgress.SingleBar({
      format: 'Waiting for app |{bar}| {value}/{total} Attempts',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);

    bar.start(retries, 0);

    const start = Date.now();

    const tryReq = async () => {
      attempts += 1;
      bar.update(attempts);
      try {
        const res = await axios.get(url, { timeout: 5000 });
        if (res.status === 200) {
          bar.stop();
          logger.success(`App responded 200 at ${url}`);
          return resolve();
        }
      } catch (err) {
        // ignore and retry
      }

      if (attempts >= retries || ((Date.now() - start) / 1000) > timeoutSeconds) {
        bar.stop();
        return reject(new Error(`Timed out waiting for ${url}`));
      }

      setTimeout(tryReq, delay);
    };

    tryReq();
  });
}

module.exports = waitForApp;

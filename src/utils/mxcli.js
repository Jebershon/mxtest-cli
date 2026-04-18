const execa = require('execa');

module.exports = async function runLocal() {
  try {
    console.log('Starting Mendix app...');
    await execa('mxcli', ['app', 'run'], { stdio: 'inherit' });

    console.log('Running tests...');
    await execa('npx', ['playwright', 'test'], { stdio: 'inherit' });

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Stopping app...');
    await execa('mxcli', ['app', 'stop']);
  }
};
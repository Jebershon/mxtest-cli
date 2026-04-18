const execa = require('execa');

module.exports = async () => {
  await execa('npx', ['playwright', 'codegen', 'http://localhost:8080'], {
    stdio: 'inherit'
  });
};
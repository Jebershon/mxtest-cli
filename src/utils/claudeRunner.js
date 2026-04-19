const path = require('path');
const { execa } = require('execa');

async function run(prompt) {
  try {
    const child = execa('claude', ['--print', prompt], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c) => { process.stdout.write(c); stdout += c; });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (c) => { process.stderr.write(c); stderr += c; });
    }
    const res = await child;
    if (res.exitCode && res.exitCode !== 0) {
      return { ok: false, message: stderr || res.stderr || 'Claude exited with an error' };
    }
    return { ok: true, output: stdout };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: false, message: "Claude Code CLI not found. show validation check in docker cmd and init cmd whether cli exist or not" };
    }
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = { run };

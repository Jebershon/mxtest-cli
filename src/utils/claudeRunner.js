const path = require('path');
const execa = require('execa');
const fs = require('fs-extra');

async function run(prompt) {
  try {
    // Use claude --print with stdin piping for the prompt
    const res = await execa('claude', ['--print'], {
      cwd: process.cwd(),
      input: prompt,  // Send prompt via stdin
      maxBuffer: 10 * 1024 * 1024  // 10MB buffer for large responses
    });

    let stdout = '';
    if (res.stdout) {
      stdout = String(res.stdout);
      // Stream output to user in real time
      if (stdout) process.stdout.write(stdout);
    }

    if (res.exitCode && res.exitCode !== 0) {
      const stderr = res.stderr ? String(res.stderr) : '';
      return { ok: false, message: stderr || 'Claude exited with an error' };
    }

    return { ok: true, output: stdout };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: false, message: "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code && claude login" };
    }

    // Check if error is related to authentication
    const errMsg = err.message ? String(err.message) : String(err);
    if (errMsg.includes('authentication') || errMsg.includes('login')) {
      return { ok: false, message: "Authentication failed. Run: claude login" };
    }

    return { ok: false, message: errMsg };
  }
}

module.exports = { run };

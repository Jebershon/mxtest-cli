const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');
const configManager = require('./configManager');

async function scan(pageFilter) {
  const cwd = process.cwd();
  const ctx = {
    projectName: null,
    mprFile: null,
    appUrl: 'http://localhost:8080',
    pages: [],
    widgets: [],
    themeFiles: [],
    jsActions: [],
    existingTests: []
  };

  try {
    // read config if present
    let cfg = {};
    try { cfg = await configManager.readConfig(); } catch (e) { cfg = {}; }
    if (cfg.appUrl) ctx.appUrl = cfg.appUrl;

    // mpr file detection
    if (cfg.mprFile) {
      ctx.mprFile = cfg.mprFile;
      ctx.projectName = path.basename(cfg.mprFile, path.extname(cfg.mprFile));
    } else {
      const files = await fs.readdir(cwd);
      const mprs = files.filter(f => f.endsWith('.mpr'));
      if (mprs.length > 0) {
        ctx.mprFile = mprs[0];
        ctx.projectName = path.basename(mprs[0], path.extname(mprs[0]));
      }
    }

    // pages
    const pagesDir = path.join(cwd, 'pages');
    if (await fs.pathExists(pagesDir)) {
      const items = await fs.readdir(pagesDir);
      for (const it of items) {
        const p = path.join(pagesDir, it);
        const stat = await fs.stat(p);
        if (stat.isDirectory()) ctx.pages.push(it);
        else if (stat.isFile() && (it.endsWith('.js') || it.endsWith('.ts'))) ctx.pages.push(path.basename(it, path.extname(it)));
      }
    }

    // widgets
    const cwidgets = path.join(cwd, 'CustomWidgets');
    const widgetsDir = path.join(cwd, 'widgets');
    if (await fs.pathExists(cwidgets)) {
      const items = await fs.readdir(cwidgets);
      for (const it of items) {
        const p = path.join(cwidgets, it);
        if ((await fs.stat(p)).isDirectory()) ctx.widgets.push(it);
      }
    } else if (await fs.pathExists(widgetsDir)) {
      const items = await fs.readdir(widgetsDir);
      for (const it of items) {
        const p = path.join(widgetsDir, it);
        if ((await fs.stat(p)).isDirectory()) ctx.widgets.push(it);
      }
    }

    // theme files
    const themeDir = path.join(cwd, 'theme', 'web');
    if (await fs.pathExists(themeDir)) {
      const items = await fs.readdir(themeDir);
      for (const it of items) {
        if (it.endsWith('.scss') || it.endsWith('.css')) ctx.themeFiles.push(it);
      }
    }

    // javascriptsource
    const jsSrc = path.join(cwd, 'javascriptsource');
    if (await fs.pathExists(jsSrc)) {
      const items = await fs.readdir(jsSrc);
      for (const it of items) {
        const p = path.join(jsSrc, it);
        if ((await fs.stat(p)).isDirectory()) ctx.jsActions.push(it);
      }
    }

    // existing tests
    const testDir = cfg.testDir ? path.resolve(cwd, cfg.testDir) : path.join(cwd, '.mxtest', 'tests');
    if (await fs.pathExists(testDir)) {
      const items = await fs.readdir(testDir);
      for (const it of items) {
        if (it.endsWith('.spec.js')) ctx.existingTests.push(it);
      }
    }

    // apply pageFilter
    if (pageFilter) {
      const match = ctx.pages.find(p => p.toLowerCase() === pageFilter.toLowerCase());
      if (match) ctx.pages = [match];
      else {
        logger.warn(`Page '${pageFilter}' not found in scanned pages. Generating anyway with provided name.`);
        ctx.pages = [pageFilter];
      }
    }

    return ctx;
  } catch (err) {
    // return best-effort context
    return ctx;
  }
}

module.exports = { scan };

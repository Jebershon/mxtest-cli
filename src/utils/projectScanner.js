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
    customWidgets: [],
    themeFiles: [],
    jsActions: [],
    microflows: [],
    nanoflows: [],
    modules: [],
    existingTests: [],
    widgetPatterns: {
      dataPickers: [],
      comboBoxes: [],
      dropdowns: [],
      forms: [],
      tables: []
    }
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

    // modules structure
    const modulesDir = path.join(cwd, 'modules');
    if (await fs.pathExists(modulesDir)) {
      const items = await fs.readdir(modulesDir);
      for (const it of items) {
        const p = path.join(modulesDir, it);
        const stat = await fs.stat(p);
        if (stat.isDirectory()) ctx.modules.push(it);
      }
    }

    // widgets and custom widgets
    const cwidgets = path.join(cwd, 'CustomWidgets');
    const widgetsDir = path.join(cwd, 'widgets');
    if (await fs.pathExists(cwidgets)) {
      const items = await fs.readdir(cwidgets);
      for (const it of items) {
        const p = path.join(cwidgets, it);
        if ((await fs.stat(p)).isDirectory()) {
          ctx.customWidgets.push(it);
          // Analyze widget manifest for patterns
          await analyzeWidgetPatterns(p, it, ctx);
        }
      }
    } else if (await fs.pathExists(widgetsDir)) {
      const items = await fs.readdir(widgetsDir);
      for (const it of items) {
        const p = path.join(widgetsDir, it);
        if ((await fs.stat(p)).isDirectory()) {
          ctx.customWidgets.push(it);
          await analyzeWidgetPatterns(p, it, ctx);
        }
      }
    }
    ctx.widgets = ctx.customWidgets;

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
        if ((await fs.stat(p)).isDirectory()) {
          ctx.jsActions.push(it);
          // Analyze JS action patterns
          await analyzeJsActionPatterns(p, it, ctx);
        }
      }
    }

    // microflows and nanoflows
    const flowsDir = path.join(cwd, 'flows');
    if (await fs.pathExists(flowsDir)) {
      await analyzeFlowPatterns(flowsDir, ctx);
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

async function analyzeWidgetPatterns(widgetPath, widgetName, ctx) {
  try {
    // Look for manifest or package.json that defines widget properties
    const manifestPath = path.join(widgetPath, 'manifest.json');
    const packagePath = path.join(widgetPath, 'package.json');

    if (await fs.pathExists(manifestPath)) {
      const manifest = await fs.readJson(manifestPath);
      if (manifest.name) {
        // Categorize by widget type
        const name = (manifest.name || '').toLowerCase();
        if (name.includes('picker') || name.includes('date')) ctx.widgetPatterns.dataPickers.push(widgetName);
        if (name.includes('combo')) ctx.widgetPatterns.comboBoxes.push(widgetName);
        if (name.includes('dropdown') || name.includes('select')) ctx.widgetPatterns.dropdowns.push(widgetName);
        if (name.includes('form')) ctx.widgetPatterns.forms.push(widgetName);
        if (name.includes('table') || name.includes('grid')) ctx.widgetPatterns.tables.push(widgetName);
      }
    } else if (await fs.pathExists(packagePath)) {
      const pkg = await fs.readJson(packagePath);
      if (pkg.name) {
        const name = (pkg.name || '').toLowerCase();
        if (name.includes('picker') || name.includes('date')) ctx.widgetPatterns.dataPickers.push(widgetName);
        if (name.includes('combo')) ctx.widgetPatterns.comboBoxes.push(widgetName);
        if (name.includes('dropdown') || name.includes('select')) ctx.widgetPatterns.dropdowns.push(widgetName);
        if (name.includes('form')) ctx.widgetPatterns.forms.push(widgetName);
        if (name.includes('table') || name.includes('grid')) ctx.widgetPatterns.tables.push(widgetName);
      }
    }
  } catch (e) {
    // ignore widget analysis errors
  }
}

async function analyzeJsActionPatterns(jsActionPath, actionName, ctx) {
  try {
    const files = await fs.readdir(jsActionPath);
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const filePath = path.join(jsActionPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        // Track patterns in JS actions for test generation
        // e.g., API calls, data transformations, validations
      }
    }
  } catch (e) {
    // ignore JS action analysis errors
  }
}

async function analyzeFlowPatterns(flowsDir, ctx) {
  try {
    const files = await fs.readdir(flowsDir);
    for (const file of files) {
      if (file.endsWith('.nf.yaml') || file.endsWith('.nf.yml')) {
        ctx.nanoflows.push(path.basename(file, path.extname(file)));
      } else if (file.endsWith('.mf.yaml') || file.endsWith('.mf.yml')) {
        ctx.microflows.push(path.basename(file, path.extname(file)));
      }
    }
  } catch (e) {
    // ignore flow analysis errors
  }
}

module.exports = { scan };

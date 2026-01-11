delete process.env.ELECTRON_RUN_AS_NODE;
// Guard against EPIPE when stdout/stderr pipes close (common on Windows shells)
if (process.stdout) {
  process.stdout.on('error', () => {});
}
if (process.stderr) {
  process.stderr.on('error', () => {});
}
const { app, BrowserWindow, shell, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://38.79.97.159:3000';
const API_BASE = process.env.API_BASE || process.env.BACKEND_URL || 'http://38.79.97.159:4000';
// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// const API_BASE = process.env.API_BASE || process.env.BACKEND_URL || 'http://localhost:4000';
const OPEN_DEVTOOLS = process.env.ELECTRON_DEVTOOLS === '1';
const EMBEDDED_FRONTEND_PORT = Number(process.env.EMBEDDED_FRONTEND_PORT || 3300);
const JOB_WINDOW_PARTITION = 'persist:smartwork-jobview';

let embeddedFrontendServer;
let embeddedFrontendUrl;
let embeddedNextApp;
let embeddedFrontendProcess;
let mainWindow;
const jobWindows = new Map();

function attachWebviewPopupHandler(contents) {
  if (!contents || contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:/i.test(url)) {
      contents.loadURL(url).catch(() => undefined);
      return { action: 'deny' };
    }
    if (url) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  const windows = BrowserWindow.getAllWindows();
  return windows.find((win) => !win.isDestroyed());
}

function shouldUseStandaloneFrontend() {
  return (
    Boolean(process.env.EMBEDDED_FRONTEND_PATH) ||
    process.env.ELECTRON_USE_EMBEDDED_FRONTEND === '1' ||
    app.isPackaged
  );
}

function resolveEmbeddedFrontendDir() {
  if (process.env.EMBEDDED_FRONTEND_PATH) {
    return path.resolve(process.env.EMBEDDED_FRONTEND_PATH);
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'embedded-frontend');
  }
  return path.join(__dirname, 'embedded-frontend');
}

function hasStandaloneFrontend(dir) {
  if (!dir) return false;
  return fs.existsSync(path.join(dir, 'server.js'));
}

function startStandaloneFrontend(dir) {
  if (embeddedFrontendProcess) return;
  const serverPath = path.join(dir, 'server.js');
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Embedded frontend server not found at ${serverPath}`);
  }

  embeddedFrontendProcess = spawn(process.execPath, [serverPath], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(EMBEDDED_FRONTEND_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  embeddedFrontendProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.log(`[embedded-frontend] ${text}`);
  });
  embeddedFrontendProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.warn(`[embedded-frontend] ${text}`);
  });
  embeddedFrontendProcess.on('exit', (code) => {
    console.warn(`[embedded-frontend] exited with code ${code ?? 'unknown'}`);
    embeddedFrontendProcess = undefined;
  });
}

function stopStandaloneFrontend() {
  if (embeddedFrontendProcess && !embeddedFrontendProcess.killed) {
    embeddedFrontendProcess.kill();
  }
}

app.on('web-contents-created', (_event, contents) => {
  attachWebviewPopupHandler(contents);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#0b1224',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = undefined;
    }
  });

  let loadedFallback = false;

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame) {
      console.warn(`ignored subframe did-fail-load ${code} ${desc} ${url}`);
      return;
    }
    console.error(`did-fail-load ${code} ${desc} ${url}`);
    if (!loadedFallback) {
      loadFallback(win, () => { loadedFallback = true; }, 'did-fail-load');
    }
  });

  const tryLoadFrontend = async () => {
    try {
      const reachable = await checkUrl(FRONTEND_URL);
      if (reachable) {
        console.log(`[electron] loading frontend: ${FRONTEND_URL}`);
        await win.loadURL(FRONTEND_URL);
        return;
      }

      console.warn(
        `[electron] frontend at ${FRONTEND_URL} not reachable; starting embedded Next server on port ${EMBEDDED_FRONTEND_PORT}.`,
      );
      const localUrl = await startEmbeddedFrontend();
      const ready = await waitForUrl(localUrl, 25, 300);
      if (!ready) throw new Error('embedded frontend did not become ready');
      console.log(`[electron] loading embedded frontend: ${localUrl}`);
      await win.loadURL(localUrl);
    } catch (err) {
      console.error('[electron] failed while loading frontend, switching to fallback.', err);
      loadFallback(win, () => { loadedFallback = true; }, 'load-error');
    } finally {
      if (OPEN_DEVTOOLS) {
        win.webContents.openDevTools({ mode: 'detach' });
      }
    }
  };

  void tryLoadFrontend();
}

function createJobWindow(targetUrl) {
  let urlToLoad;
  try {
    // Validate URL input to avoid navigation to invalid schemes.
    const parsed = new URL(targetUrl);
    urlToLoad = parsed.toString();
  } catch (err) {
    throw new Error(`Invalid URL: ${targetUrl}`);
  }

  // Reuse existing window per exact URL to reduce window spam.
  const existing = jobWindows.get(urlToLoad);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    existing.loadURL(urlToLoad).catch(() => undefined);
    return existing;
  }

  const jobWin = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b1224',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: JOB_WINDOW_PARTITION,
      // Keep a minimal preload to avoid exposing node to third-party pages.
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  jobWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  jobWin.loadURL(urlToLoad).catch((err) => {
    console.error('[electron] failed to load job window url', err);
  });

  jobWin.on('closed', () => {
    jobWindows.delete(urlToLoad);
  });

  jobWindows.set(urlToLoad, jobWin);
  return jobWin;
}

app.whenReady().then(async () => {
  createWindow();

  ipcMain.handle('set-app-badge', async (_event, payload) => {
    const count = Math.max(0, Number(payload?.count) || 0);
    const badgeDataUrl = typeof payload?.badgeDataUrl === 'string' ? payload.badgeDataUrl : null;
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge(count > 0 ? String(count) : '');
    } else if (process.platform === 'win32') {
      const win = getMainWindow();
      if (win) {
        if (count > 0 && badgeDataUrl) {
          const image = nativeImage.createFromDataURL(badgeDataUrl);
          if (!image.isEmpty()) {
            win.setOverlayIcon(image, `${count} unread notifications`);
          } else {
            win.setOverlayIcon(null, '');
          }
        } else {
          win.setOverlayIcon(null, '');
        }
      }
    } else if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(count);
    }
    return { ok: true };
  });

  ipcMain.handle('open-job-window', async (_event, targetUrl) => {
    try {
      createJobWindow(targetUrl);
      return { ok: true };
    } catch (err) {
      console.error('[electron] failed to open job window', err);
      return { ok: false, error: err.message || 'Failed to open window' };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (embeddedFrontendServer) {
    embeddedFrontendServer.close(() => {});
  }
  if (embeddedNextApp?.close) {
    embeddedNextApp.close().catch(() => undefined);
  }
  stopStandaloneFrontend();
});

function checkUrl(url) {
  const checker = url.startsWith('https:') ? https : http;
  return new Promise((resolve) => {
    const req = checker.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, attempts = 15, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    const ok = await checkUrl(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function startEmbeddedFrontend() {
  if (embeddedFrontendUrl) return embeddedFrontendUrl;
  if (shouldUseStandaloneFrontend()) {
    const embeddedDir = resolveEmbeddedFrontendDir();
    if (hasStandaloneFrontend(embeddedDir)) {
      console.log(`[electron] starting embedded frontend from ${embeddedDir}`);
      startStandaloneFrontend(embeddedDir);
      embeddedFrontendUrl = `http://localhost:${EMBEDDED_FRONTEND_PORT}`;
      return embeddedFrontendUrl;
    }
    if (app.isPackaged) {
      throw new Error(`Embedded frontend missing at ${embeddedDir}`);
    }
    console.warn(`[electron] embedded frontend not found at ${embeddedDir}; falling back to dev server.`);
  }
  // Force the same API base for the embedded server so it matches the desktop shell expectations.
  if (!process.env.NEXT_PUBLIC_API_BASE) {
    process.env.NEXT_PUBLIC_API_BASE = API_BASE;
  }
  const frontendDir = path.resolve(__dirname, '..', 'frontend');
  const next = loadNextModule(frontendDir);
  const nextApp = next({
    dev: true,
    dir: frontendDir,
    hostname: '127.0.0.1',
    port: EMBEDDED_FRONTEND_PORT,
  });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handle(req, res));
    server.on('error', reject);
    server.listen(EMBEDDED_FRONTEND_PORT, '127.0.0.1', () => {
      embeddedFrontendServer = server;
      embeddedNextApp = nextApp;
      resolve();
    });
  });
  embeddedFrontendUrl = `http://localhost:${EMBEDDED_FRONTEND_PORT}`;
  return embeddedFrontendUrl;
}

function loadNextModule(frontendDir) {
  const workspacePath = path.join(frontendDir, 'node_modules', 'next');
  try {
    return require(workspacePath);
  } catch {
    // fall through
  }
  try {
    // Use hoisted dependency if workspaces installed at root.
    return require('next');
  } catch (err) {
    throw new Error(
      `Cannot load Next. Tried ${workspacePath} and node resolution. Run "npm --workspace frontend install". ${err.message}`,
    );
  }
}

function loadFallback(win, markLoaded, reason) {
  if (typeof markLoaded === 'function') {
    markLoaded();
  }
  const fallbackPath = path.join(__dirname, 'fallback.html');
  win
    .loadFile(fallbackPath, {
      query: {
        apiBase: API_BASE,
        reason: reason || 'fallback',
      },
    })
    .catch((err) => {
      console.error('Failed to load fallback UI', err);
    });
}

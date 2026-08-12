const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const DIST_PATH = path.join(__dirname, '..', 'dist');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const APP_ICON_PATH = path.join(__dirname, '..', 'icono.ico');
const FIRST_RUN_ZOOM_FILE = 'first-run-zoom-initialized.json';
const LOCAL_PROJECTS_FILE = 'local-projects.json';
let pendingOpenFilePath = null;
let mainWindowRef = null;

function getLocalProjectsFilePath() {
  return path.join(app.getPath('userData'), LOCAL_PROJECTS_FILE);
}

function normalizeOpenFilePath(filePath) {
  if (typeof filePath !== 'string') return null;
  if (filePath.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(filePath).pathname);
    } catch (_) {
      return null;
    }
  }
  return filePath;
}

function isSupportedOpenFilePath(filePath) {
  const normalized = normalizeOpenFilePath(filePath);
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  return lower.endsWith('.mdm') || lower.endsWith('.dmm') || lower.endsWith('.json');
}

function extractOpenFileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (isSupportedOpenFilePath(arg)) {
      return normalizeOpenFilePath(arg);
    }
  }
  return null;
}

function dispatchOpenFile(filePath, targetWindow = mainWindowRef) {
  const normalizedFilePath = normalizeOpenFilePath(filePath);
  if (!isSupportedOpenFilePath(normalizedFilePath)) return;
  pendingOpenFilePath = normalizedFilePath;

  if (!targetWindow || targetWindow.isDestroyed()) return;
  if (targetWindow.isMinimized()) targetWindow.restore();
  targetWindow.show();
  targetWindow.focus();

  if (!targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.send('app:open-file', filePath);
  }
}

ipcMain.handle('sync:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('sync:writeProjects', async (_event, folderPath, projects) => {
  if (!folderPath) return { ok: false, error: 'Missing folderPath' };
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    const payload = {
      format: 'mongodb-model-viewer-sync',
      updatedAt: new Date().toISOString(),
      projects: Array.isArray(projects) ? projects : []
    };
    const filePath = path.join(folderPath, 'mongodb-model-viewer-projects.json');
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unknown write error' };
  }
});

ipcMain.handle('sync:readProjects', async (_event, folderPath) => {
  if (!folderPath) return { ok: false, error: 'Missing folderPath', projects: [] };
  try {
    const filePath = path.join(folderPath, 'mongodb-model-viewer-projects.json');
    if (!fs.existsSync(filePath)) {
      return { ok: true, projects: [], filePath };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
      filePath
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unknown read error', projects: [] };
  }
});

ipcMain.handle('storage:writeLocalProjects', async (_event, projects) => {
  try {
    const filePath = getLocalProjectsFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          format: 'mongodb-model-viewer-local-projects',
          updatedAt: new Date().toISOString(),
          projects: Array.isArray(projects) ? projects : []
        },
        null,
        2
      ),
      'utf-8'
    );
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unknown local storage write error' };
  }
});

ipcMain.handle('storage:readLocalProjects', async () => {
  try {
    const filePath = getLocalProjectsFilePath();
    if (!fs.existsSync(filePath)) {
      return { ok: true, projects: [], filePath };
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
      filePath
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unknown local storage read error', projects: [] };
  }
});

function createMainWindow(initialOpenFilePath = null) {
  const mainWindow = new BrowserWindow({
    title: 'MongoDBModeler',
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  });
  mainWindowRef = mainWindow;
  mainWindow.webContents.session.setSpellCheckerLanguages(['es-ES', 'en-US']);

  mainWindow.on('focus', () => {
    mainWindowRef = mainWindow;
  });
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) {
      const [nextWindow] = BrowserWindow.getAllWindows().filter((window) => window !== mainWindow && !window.isDestroyed());
      mainWindowRef = nextWindow || null;
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(DIST_PATH, 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = initialOpenFilePath || pendingOpenFilePath;
    if (filePath) {
      dispatchOpenFile(filePath, mainWindow);
    }
  });

  // Apply 80% zoom only on the very first app launch on this machine/profile.
  const firstRunZoomMarkerPath = path.join(app.getPath('userData'), FIRST_RUN_ZOOM_FILE);
  const shouldApplyFirstRunZoom = !fs.existsSync(firstRunZoomMarkerPath);
  if (shouldApplyFirstRunZoom) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.setZoomFactor(0.8);
      try {
        fs.writeFileSync(
          firstRunZoomMarkerPath,
          JSON.stringify({ appliedAt: new Date().toISOString(), zoomFactor: 0.8 }, null, 2),
          'utf-8'
        );
      } catch (error) {
        console.warn('Could not persist first-run zoom marker:', error?.message || error);
      }
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isInternalNavigation =
      url.startsWith('file://') || Boolean(VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL));

    if (!isInternalNavigation) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const hasTextSelection = Boolean(params.selectionText && params.selectionText.trim());
    const isEditable = Boolean(params.isEditable);

    if (!isEditable && !hasTextSelection) {
      return;
    }

    const template = [];

    if (isEditable && Array.isArray(params.dictionarySuggestions) && params.dictionarySuggestions.length > 0) {
      params.dictionarySuggestions.slice(0, 6).forEach((suggestion) => {
        template.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      });
      template.push({ type: 'separator' });
    }

    if (isEditable && params.misspelledWord) {
      template.push({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      template.push({ type: 'separator' });
    }

    if (isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      );
    } else if (hasTextSelection) {
      template.push({ role: 'copy' }, { role: 'selectAll' });
    }

    if (template.length === 0) {
      return;
    }

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

ipcMain.handle('app:readTextFile', async (_event, filePath) => {
  try {
    if (!filePath) return { ok: false, error: 'Missing file path' };
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, content, modifiedAt: fs.statSync(filePath).mtime.toISOString() };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not read file' };
  }
});

ipcMain.handle('app:getPendingOpenFile', async () => {
  const filePath = pendingOpenFilePath;
  pendingOpenFilePath = null;
  return filePath || null;
});

ipcMain.handle('app:clearPendingOpenFile', async (_event, filePath) => {
  if (!filePath || pendingOpenFilePath === filePath) {
    pendingOpenFilePath = null;
  }
  return true;
});

ipcMain.handle('app:writeTextFile', async (_event, filePath, content) => {
  try {
    if (!filePath) return { ok: false, error: 'Missing file path' };
    if (typeof content !== 'string') return { ok: false, error: 'Invalid content' };
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not write file' };
  }
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const openFile = extractOpenFileFromArgv(argv);
    if (openFile) {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        dispatchOpenFile(openFile);
      } else {
        createMainWindow(openFile);
      }
    } else if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.show();
      mainWindowRef.focus();
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const normalizedFilePath = normalizeOpenFilePath(filePath);
  if (!isSupportedOpenFilePath(normalizedFilePath)) return;

  if (app.isReady()) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      dispatchOpenFile(normalizedFilePath);
    } else {
      pendingOpenFilePath = normalizedFilePath;
      createMainWindow(normalizedFilePath);
    }
    return;
  }

  pendingOpenFilePath = normalizedFilePath;
});

app.whenReady().then(() => {
  app.setName('MongoDBModeler');
  pendingOpenFilePath = pendingOpenFilePath || extractOpenFileFromArgv(process.argv);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

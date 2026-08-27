const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  onOpenFile: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, filePath) => handler(filePath);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },
  getPendingOpenFile: () => ipcRenderer.invoke('app:getPendingOpenFile'),
  clearPendingOpenFile: (filePath) => ipcRenderer.invoke('app:clearPendingOpenFile', filePath),
  onBeforeClose: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = async () => {
      const canClose = await handler();
      ipcRenderer.send('app:close-response', Boolean(canClose));
    };
    ipcRenderer.on('app:before-close', listener);
    return () => ipcRenderer.removeListener('app:before-close', listener);
  },
  readTextFile: (filePath) => ipcRenderer.invoke('app:readTextFile', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('app:writeTextFile', filePath, content),
  storage: {
    writeLocalProjects: (projects) => ipcRenderer.invoke('storage:writeLocalProjects', projects),
    readLocalProjects: () => ipcRenderer.invoke('storage:readLocalProjects')
  },
  sync: {
    selectFolder: () => ipcRenderer.invoke('sync:selectFolder'),
    writeProjects: (folderPath, projects) => ipcRenderer.invoke('sync:writeProjects', folderPath, projects),
    readProjects: (folderPath) => ipcRenderer.invoke('sync:readProjects', folderPath)
  }
});

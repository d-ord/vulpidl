const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFile: (filters) => ipcRenderer.invoke('pick-file', filters),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  deleteFile: (p) => ipcRenderer.invoke('delete-file', p),

  scanLibrary: (folder) => ipcRenderer.invoke('scan-library', folder),
  probeAudio: (file) => ipcRenderer.invoke('probe-audio', file),

  fetchInfo: (url) => ipcRenderer.invoke('fetch-info', url),
  searchYT: (query, count) => ipcRenderer.invoke('search-yt', query, count),
  download: (opts) => ipcRenderer.invoke('download', opts),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),

  separateStems: (opts) => ipcRenderer.invoke('separate-stems', opts),
  cancelStems: () => ipcRenderer.invoke('cancel-stems'),
  checkDemucs: () => ipcRenderer.invoke('check-demucs'),
  onStemsProgress: (cb) => ipcRenderer.on('stems-progress', (_e, data) => cb(data)),

  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_e, data) => cb(data)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, data) => cb(data)),
  onProtocolUrl: (cb) => ipcRenderer.on('protocol-url', (_e, url) => cb(url)),

  checkDeps: () => ipcRenderer.invoke('check-deps'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  getLogDir: () => ipcRenderer.invoke('get-log-dir'),
  openLogDir: () => ipcRenderer.invoke('open-log-dir'),
});

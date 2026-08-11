const { contextBridge, ipcRenderer } = require('electron')

// Theme API for independent dark/light mode
contextBridge.exposeInMainWorld('theme', {
  get: async () => {
    try { return await ipcRenderer.invoke('theme:get') } catch { return 'light' }
  },
  set: async (theme) => {
    try { return await ipcRenderer.invoke('theme:set', theme) } catch { return { ok: false } }
  }
})

// License status API for showing expiry banner in renderer
contextBridge.exposeInMainWorld('license', {
  getStatus: async () => {
    try { return await ipcRenderer.invoke('license:getStatus') } catch { return { valid: true, daysRemaining: Infinity } }
  },
  onStatus: (cb) => {
    const handler = (_event, status) => { try { cb && cb(status) } catch {} }
    ipcRenderer.on('license:status', handler)
    return () => ipcRenderer.removeListener('license:status', handler)
  }
})

contextBridge.exposeInMainWorld('printing', {
  listPrinters: async () => {
    try { return await ipcRenderer.invoke('printing:list') } catch { return [] }
  },
  printRaw: async (text, deviceName) => {
    try { return await ipcRenderer.invoke('printing:raw', { text, deviceName }) } catch (e) { return { ok: false, error: String(e) } }
  },
  printHTML: async (html, deviceName) => {
    try { return await ipcRenderer.invoke('printing:print-html', { html, deviceName }) } catch (e) { return { ok: false, error: String(e) } }
  }
})

// Backup helpers for selecting a folder and saving/restoring files
contextBridge.exposeInMainWorld('backup', {
  selectFolder: async () => {
    try { return await ipcRenderer.invoke('backup:select-folder') } catch { return '' }
  },
  saveToFolder: async (folderPath, fileName, data) => {
    try { return await ipcRenderer.invoke('backup:save', { folderPath, fileName, data }) } catch (e) { return { ok: false, error: String(e) } }
  },
  openFile: async () => {
    try { return await ipcRenderer.invoke('backup:open-file') } catch { return '' }
  },
  readFile: async (fullPath) => {
    try { return await ipcRenderer.invoke('backup:read', { fullPath }) } catch { return '' }
  }
})

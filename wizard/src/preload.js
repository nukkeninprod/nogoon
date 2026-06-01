const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nogoon', {
  installFree: () => ipcRenderer.invoke('install:free'),
  installPermanent: () => ipcRenderer.invoke('install:permanent'),
  openURL: (url) => ipcRenderer.invoke('open:url', url),
  unblock: () => ipcRenderer.invoke('install:unblock'),
  checkState: () => ipcRenderer.invoke('check:state'),
  createCheckout: () => ipcRenderer.invoke('checkout:create'),
  checkPayment: (sessionId) => ipcRenderer.invoke('checkout:check', sessionId),
  activateLicense: (key, checkOnly = false) => ipcRenderer.invoke('license:activate', key, checkOnly),
  trackEvent: (eventName, params = {}) => ipcRenderer.invoke('track:event', eventName, params),
  closeWindow: () => ipcRenderer.send('window:close'),
  minimizeWindow: () => ipcRenderer.send('window:minimize')
});

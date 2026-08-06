const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isElectron: true,

  getEquipmentSummary: () => ipcRenderer.invoke('get-equipment-summary'),

  runSpeedTest: () => ipcRenderer.invoke('run-speed-test'),
  onSpeedTestProgress: (cb) => ipcRenderer.on('speed-test-progress', (_e, msg) => cb(msg)),
  onSpeedTestRealtime: (cb) => ipcRenderer.on('speed-test-realtime', (_e, data) => cb(data)),

  getNetworkOptions: () => ipcRenderer.invoke('get-network-options'),
  runNetworkAction: (data) => ipcRenderer.invoke('run-network-action', data),

  runDiagnostico: () => ipcRenderer.invoke('run-diagnostico'),

  getPowerPlanInfo: () => ipcRenderer.invoke('get-power-plan-info'),
  activateHighPerformance: () => ipcRenderer.invoke('activate-high-performance'),

  runSfc: () => ipcRenderer.invoke('run-sfc'),
  onSfcProgress: (cb) => ipcRenderer.on('sfc-progress', (_e, msg) => cb(msg)),

  runDism: () => ipcRenderer.invoke('run-dism'),
  onDismProgress: (cb) => ipcRenderer.on('dism-progress', (_e, msg) => cb(msg)),

  runMdsched: () => ipcRenderer.invoke('run-mdsched'),

  runCleanTemp: () => ipcRenderer.invoke('run-clean-temp'),
  scanTemp: () => ipcRenderer.invoke('scan-temp'),
  onCleanTempProgress: (cb) => ipcRenderer.on('clean-temp-progress', (_e, msg) => cb(msg)),

  getGpuDrivers: () => ipcRenderer.invoke('get-gpu-drivers'),

  getSystemUpdates: () => ipcRenderer.invoke('get-system-updates'),
  runSystemUpdatesAction: (data) => ipcRenderer.invoke('run-system-updates-action', data),

  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  runEventLogAnalysis: (daysBack) => ipcRenderer.invoke('run-event-log-analysis', daysBack),
  onEventLogProgress: (cb) => ipcRenderer.on('event-log-progress', (_e, msg) => cb(msg)),
  exportEventReport: (payload) => ipcRenderer.invoke('export-event-report', payload),

  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  onAppLog: (cb) => ipcRenderer.on('app-log', (_e, entry) => cb(entry)),
});

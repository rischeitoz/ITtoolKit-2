const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isElectron: true,

  getEquipmentSummary: () => ipcRenderer.invoke('get-equipment-summary'),

  runSpeedTest: () => ipcRenderer.invoke('run-speed-test'),
  onSpeedTestProgress: (cb) => ipcRenderer.on('speed-test-progress', (_e, msg) => cb(msg)),
  onSpeedTestRealtime: (cb) => ipcRenderer.on('speed-test-realtime', (_e, data) => cb(data)),

  getNetworkOptions: () => ipcRenderer.invoke('get-network-options'),
  runNetworkAction: (data) => ipcRenderer.invoke('run-network-action', data),
  runPingTest: (data) => ipcRenderer.invoke('run-ping-test', data),

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

  getSystemInfoDetails: () => ipcRenderer.invoke('get-system-info-details'),
  changeComputerName: (data) => ipcRenderer.invoke('change-computer-name', data),
  changeDomainWorkgroup: (data) => ipcRenderer.invoke('change-domain-workgroup', data),
  changeUserPassword: (data) => ipcRenderer.invoke('change-user-password', data),

  getMonitorsInfo: () => ipcRenderer.invoke('get-monitors-info'),
  detectMonitorsAction: () => ipcRenderer.invoke('detect-monitors-action'),
  setMonitorHz: (data) => ipcRenderer.invoke('set-monitor-hz', data),
  openDisplaySettings: () => ipcRenderer.invoke('open-display-settings'),

  getPeripheralsInfo: () => ipcRenderer.invoke('get-peripherals-info'),

  getPrinters: () => ipcRenderer.invoke('get-printers'),
  installCanonPrinter: (data) => ipcRenderer.invoke('install-canon-printer', data),

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

  // Tutoriales en PDF y DOCX (\\cielo\INFORMATICA\TUTORIALES)
  getTutorials: (customPath) => ipcRenderer.invoke('get-tutorials', customPath),
  selectTutorialsFolder: () => ipcRenderer.invoke('select-tutorials-folder'),
  readPdfBase64: (filePath) => ipcRenderer.invoke('read-pdf-base64', filePath),
  readDocHtml: (filePath) => ipcRenderer.invoke('read-doc-html', filePath),
  openExternalFile: (filePath) => ipcRenderer.invoke('open-external-file', filePath),

  // Controles de ventana (Custom TitleBar)
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizeChange: (cb) => ipcRenderer.on('window-maximize-change', (_e, isMax) => cb(isMax)),
});

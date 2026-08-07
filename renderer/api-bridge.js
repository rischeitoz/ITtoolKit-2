// HCPToolKit Web API Bridge (Replaces Electron IPC in web environment)

(function () {
  // If running in Electron native desktop app, preload.js already provides window.api
  if (window.api && window.api.isElectron) {
    console.log('[HCPToolKit] Entorno Electron nativo detectado. Usando IPC de Electron.');
    return;
  }
  const eventCallbacks = {
    'speed-test-progress': [],
    'speed-test-realtime': [],
    'sfc-progress': [],
    'dism-progress': [],
    'clean-temp-progress': [],
    'event-log-progress': [],
    'app-log': []
  };

  // Connect to SSE stream for live progress and activity logs
  function connectSSE() {
    try {
      const evtSource = new EventSource('/api/events');

      Object.keys(eventCallbacks).forEach(eventName => {
        evtSource.addEventListener(eventName, (e) => {
          try {
            const data = JSON.parse(e.data);
            eventCallbacks[eventName].forEach(cb => {
              try { cb(data); } catch (err) { console.error(`Error in ${eventName} callback:`, err); }
            });
          } catch (err) {
            console.error('SSE JSON parse error:', err);
          }
        });
      });

      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSSE, 3000);
      };
    } catch (e) {
      console.warn('SSE connection failed, will retry:', e.message);
      setTimeout(connectSSE, 3000);
    }
  }

  connectSSE();

  async function postJson(url, body = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.api = {
    getEquipmentSummary: () => getJson('/api/equipment-summary'),

    runSpeedTest: () => postJson('/api/speed-test'),
    onSpeedTestProgress: (cb) => { eventCallbacks['speed-test-progress'].push(cb); },
    onSpeedTestRealtime: (cb) => { eventCallbacks['speed-test-realtime'].push(cb); },

    getNetworkOptions: () => getJson('/api/network-options'),
    runNetworkAction: (data) => postJson('/api/network-action', data),
    runPingTest: (data) => postJson('/api/ping-test', data),

    runDiagnostico: () => postJson('/api/diagnostico'),

    getPowerPlanInfo: () => getJson('/api/power-plan-info'),
    activateHighPerformance: () => postJson('/api/activate-high-performance'),

    runSfc: () => postJson('/api/sfc'),
    onSfcProgress: (cb) => { eventCallbacks['sfc-progress'].push(cb); },

    runDism: () => postJson('/api/dism'),
    onDismProgress: (cb) => { eventCallbacks['dism-progress'].push(cb); },

    runMdsched: () => postJson('/api/mdsched'),

    runCleanTemp: () => postJson('/api/clean-temp'),
    scanTemp: () => getJson('/api/scan-temp'),
    onCleanTempProgress: (cb) => { eventCallbacks['clean-temp-progress'].push(cb); },

    getGpuDrivers: () => getJson('/api/gpu-drivers'),

    getSystemInfoDetails: () => getJson('/api/system-info-details'),
    changeComputerName: (data) => postJson('/api/change-computer-name', data),
    changeDomainWorkgroup: (data) => postJson('/api/change-domain-workgroup', data),
    changeUserPassword: (data) => postJson('/api/change-user-password', data),

    getSystemUpdates: () => getJson('/api/system-updates'),
    runSystemUpdatesAction: (data) => postJson('/api/system-updates-action', data),

    openUrl: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); },

    copyToClipboard: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    },

    runEventLogAnalysis: (range) => postJson('/api/event-log-analysis', { range }),
    onEventLogProgress: (cb) => { eventCallbacks['event-log-progress'].push(cb); },

    exportEventReport: async ({ format, html, text, defaultName }) => {
      try {
        const ext = format === 'pdf' ? 'pdf' : format === 'html' ? 'html' : 'txt';
        const fileName = `${defaultName}.${ext}`;
        if (format === 'html') {
          downloadFile(fileName, html, 'text/html;charset=utf-8');
        } else if (format === 'txt') {
          downloadFile(fileName, text, 'text/plain;charset=utf-8');
        } else if (format === 'pdf') {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); }, 500);
          } else {
            downloadFile(`${defaultName}.html`, html, 'text/html;charset=utf-8');
          }
        }
        return { success: true, filePath: fileName };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    getLogPath: async () => {
      const data = await getJson('/api/log-path');
      return data.path;
    },

    openLogFolder: async () => {
      const logs = await getJson('/api/open-log-folder');
      const logText = (logs.logs || []).map(l => `[${l.ts}] [${l.level}] ${l.message}`).join('\n');
      downloadFile(`ITToolkit_Logs_${new Date().toISOString().slice(0, 10)}.log`, logText, 'text/plain;charset=utf-8');
      return true;
    },

    onAppLog: (cb) => { eventCallbacks['app-log'].push(cb); }
  };
})();

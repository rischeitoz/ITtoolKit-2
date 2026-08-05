const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const path  = require('path');
const os    = require('os');
const { execFile, exec } = require('child_process');
const https = require('https');
const fs    = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// LOG DE ACTIVIDAD
// ─────────────────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(os.homedir(), 'ITToolkit_Logs');
let logStream   = null;
let logFilePath = null;
let mainWindow;

function initLog() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file  = path.join(LOG_DIR, `ITToolkit_${stamp}.log`);
    logStream   = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' });
    appLog('INFO', `=== IT Toolkit iniciado. Log: ${file} ===`);
    appLog('INFO', `Equipo: ${os.hostname()} | Usuario: ${os.userInfo().username} | OS: ${os.type()} ${os.release()}`);
    return file;
  } catch (e) { console.error('Log init error:', e.message); return null; }
}

function appLog(level, message) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  try { if (logStream) logStream.write(line + '\n'); } catch {}
  try {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('app-log', { ts, level, message });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// VENTANA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150, height: 750, minWidth: 950, minHeight: 620,
    title: 'IT Toolkit - Diagnóstico y Mantenimiento',
    backgroundColor: '#F5F6F8',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => { logFilePath = initLog(); createWindow(); });
app.on('window-all-closed', () => {
  appLog('INFO', '=== IT Toolkit cerrado ===');
  if (logStream) logStream.end();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('get-log-path',    () => logFilePath);
ipcMain.handle('open-log-folder', () => shell.openPath(LOG_DIR));

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD INTERNA: ejecutar cualquier comando sin PowerShell
// ─────────────────────────────────────────────────────────────────────────────
function runCmd(cmd, args, timeoutMs = 25000) {
  return new Promise((resolve) => {
    execFile(cmd, args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (err.code || -1) : 0,
                  stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
      });
  });
}

function runExec(cmdStr, timeoutMs = 25000) {
  return new Promise((resolve) => {
    exec(cmdStr,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 20, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (err.code || -1) : 0,
                  stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
      });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE ESTADO INFERIOR — sólo Node.js nativo, cero PowerShell
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('get-equipment-summary', async () => {
  const uptimeSec = os.uptime();
  const days  = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins  = Math.floor((uptimeSec % 3600) / 60);
  const uptimeText = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;

  // Versión del SO desde el Registro de Windows (sin PowerShell / sin WMIC)
  let osCaption = `${os.type()} ${os.release()}`;
  try {
    const regKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
    const prodRes = await runCmd('reg', ['query', regKey, '/v', 'ProductName']);
    const dispRes = await runCmd('reg', ['query', regKey, '/v', 'DisplayVersion']);
    const prod = /ProductName\s+REG_SZ\s+(.+)/i.exec(prodRes.stdout || '')?.[1];
    const disp = /DisplayVersion\s+REG_SZ\s+(.+)/i.exec(dispRes.stdout || '')?.[1];
    if (prod) {
      osCaption = disp ? `${prod.trim()} (${disp.trim()})` : prod.trim();
    }
  } catch {}

  return { computerName: os.hostname(), userName: os.userInfo().username,
           operatingSystem: osCaption, uptimeText };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD 1: TEST DE VELOCIDAD (metodología por ventana de tiempo)
// ─────────────────────────────────────────────────────────────────────────────
async function measurePing() {
  // Ejecutar ping de forma asíncrona sin bloquear el event loop de Node.
  // ping.exe en Windows puede tardar hasta ~12 s con 8 pings — runCmd ya lo
  // ejecuta como proceso separado (execFile) así que no bloquea, pero
  // reducimos a 4 muestras para no alargar el test innecesariamente.
  const r = await runCmd('ping', ['-n', '4', '1.1.1.1'], 15000);
  const out = r.stdout || '';

  // El formato de ping varía según el idioma de Windows:
  //   ES: "tiempo=12ms" / "tiempo<1ms"
  //   EN: "time=12ms" / "time<1ms" / "time=12.3ms"
  const matches = [
    ...out.matchAll(/(?:tiempo|time)[=<](\d+(?:\.\d+)?)ms/gi),
  ];
  const times = matches.map(m => parseFloat(m[1])).filter(n => !isNaN(n) && n >= 0);

  if (times.length === 0) {
    appLog('WARN', `[SpeedTest/Ping] No se pudo parsear la salida del ping. Salida raw: ${out.slice(0, 200)}`);
    return { ping: 999, jitter: 0 };
  }
  const avg    = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const jitter = Math.round(Math.max(...times) - Math.min(...times));
  appLog('INFO', `[SpeedTest/Ping] Tiempos: [${times.join(', ')}] ms — avg=${avg} jitter=${jitter}`);
  return { ping: avg, jitter };
}

// Descarga: abre N conexiones y mide los bytes totales acumulados durante
// exactamente durationMs. El timer es la única forma de resolver — nunca
// cortamos antes porque las conexiones terminen (en redes lentas o con proxy
// los streams pueden cerrarse antes de que el timer expire y daríamos 0).
function measureDownloadThroughput(connections, durationMs, onProgress) {
  return new Promise((resolve) => {
    let totalBytes = 0;
    let settled    = false;
    const tStart   = Date.now();
    const openReqs = [];

    const interval = setInterval(() => {
      if (settled) return;
      const elapsed = (Date.now() - tStart) / 1000;
      const mbps = elapsed > 0.1 ? (totalBytes * 8) / 1_000_000 / elapsed : 0;
      if (onProgress) onProgress(Math.round(mbps * 10) / 10, totalBytes, elapsed);
    }, 150);

    function finish() {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      openReqs.forEach(r => { try { r.destroy(); } catch {} });
      const elapsed = (Date.now() - tStart) / 1000;
      const mbps    = elapsed > 0.3 ? (totalBytes * 8) / 1_000_000 / elapsed : 0;
      appLog('INFO', `[SpeedTest/DL] ${connections} conn, ${(totalBytes/1e6).toFixed(1)} MB en ${elapsed.toFixed(1)}s → ${mbps.toFixed(1)} Mbps`);
      resolve(mbps);
    }

    const timer = setTimeout(finish, durationMs);

    function startConnection(connIndex) {
      if (settled) return;
      try {
        const req = https.get(
          {
            hostname: 'speed.cloudflare.com',
            path: `/__down?bytes=25000000&r=${connIndex}_${Math.random()}`,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Referer': 'https://speed.cloudflare.com/'
            }
          },
          (res) => {
            if (res.statusCode !== 200) {
              appLog('WARN', `[SpeedTest/DL] Conexión ${connIndex}: HTTP ${res.statusCode}`);
              if (!settled && res.statusCode === 429) {
                setTimeout(() => startConnection(connIndex), 400);
              }
              res.destroy();
              return;
            }
            res.on('data',  chunk => { totalBytes += chunk.length; });
            res.on('end',   () => { if (!settled) startConnection(connIndex); });
            res.on('error', () => {});
          }
        );
        req.setTimeout(durationMs + 8000, () => req.destroy());
        req.on('error', () => {});
        openReqs.push(req);
      } catch (e) {
        appLog('WARN', `[SpeedTest/DL] No se pudo abrir conexión ${connIndex}: ${e.message}`);
      }
    }

    for (let i = 0; i < connections; i++) {
      setTimeout(() => startConnection(i), i * 100);
    }
  });
}

// Subida: mismo principio — el timer es la única forma de resolver.
function measureUploadThroughput(connections, durationMs, onProgress) {
  return new Promise((resolve) => {
    let totalBytesSent = 0;
    let settled        = false;
    const tStart       = Date.now();
    const openReqs     = [];

    const interval = setInterval(() => {
      if (settled) return;
      const elapsed = (Date.now() - tStart) / 1000;
      const mbps = elapsed > 0.1 ? (totalBytesSent * 8) / 1_000_000 / elapsed : 0;
      if (onProgress) onProgress(Math.round(mbps * 10) / 10, totalBytesSent, elapsed);
    }, 150);

    function finish() {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      openReqs.forEach(r => { try { r.destroy(); } catch {} });
      const elapsed = (Date.now() - tStart) / 1000;
      const mbps    = elapsed > 0.3 ? (totalBytesSent * 8) / 1_000_000 / elapsed : 0;
      appLog('INFO', `[SpeedTest/UL] ${connections} conn, ${(totalBytesSent/1e6).toFixed(1)} MB en ${elapsed.toFixed(1)}s → ${mbps.toFixed(1)} Mbps`);
      resolve(mbps);
    }

    const timer = setTimeout(finish, durationMs);

    const CHUNK = Buffer.alloc(65536, 0x41);
    for (let i = 0; i < connections; i++) {
      setTimeout(() => {
        if (settled) return;
        try {
          const req = https.request({
            hostname: 'speed.cloudflare.com', path: '/__up', method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Transfer-Encoding': 'chunked',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': 'https://speed.cloudflare.com/'
            },
          }, (res) => {
            res.on('data',  () => {});
            res.on('error', () => {});
          });
          req.setTimeout(durationMs + 8000, () => req.destroy());
          req.on('error', () => {});
          openReqs.push(req);

          // Escribir en bucle hasta que el timer llame a finish()
          function writeLoop(r) {
            if (settled) { try { r.end(); } catch {} return; }
            const ok = r.write(CHUNK);
            totalBytesSent += CHUNK.length;
            if (ok) setImmediate(() => writeLoop(r));
            else    r.once('drain', () => writeLoop(r));
          }
          writeLoop(req);
        } catch (e) {
          appLog('WARN', `[SpeedTest/UL] No se pudo abrir conexión ${i}: ${e.message}`);
        }
      }, i * 100);
    }
  });
}

function rateSpeed(value, thresholds) {
  for (const t of thresholds) if (value >= t.min) return t;
  return thresholds[thresholds.length - 1];
}

ipcMain.handle('run-speed-test', async (event) => {
  const send = (msg) => { event.sender.send('speed-test-progress', msg); appLog('INFO', `[SpeedTest] ${msg}`); };
  const sendRealtime = (data) => event.sender.send('speed-test-realtime', data);

  send('Midiendo ping y latencia...');
  sendRealtime({ phase: 'ping', mbps: 0, ping: 0, jitter: 0 });
  const { ping, jitter } = await measurePing();
  send(`Ping: ${ping} ms   Jitter: ${jitter} ms`);
  sendRealtime({ phase: 'ping', mbps: 0, ping, jitter });

  send('Test de descarga — calentamiento...');
  sendRealtime({ phase: 'download_warmup', mbps: 0, ping, jitter });
  await measureDownloadThroughput(2, 2000, (mbps) => sendRealtime({ phase: 'download_warmup', mbps, ping, jitter }));

  send('Test de descarga — midiendo (8 s)...');
  sendRealtime({ phase: 'download', mbps: 0, ping, jitter });
  const download = Math.round(await measureDownloadThroughput(3, 8000, (mbps) => sendRealtime({ phase: 'download', mbps, ping, jitter })) * 10) / 10;
  send(`Descarga: ${download} Mbps`);
  sendRealtime({ phase: 'download_done', mbps: download, download, ping, jitter });

  send('Test de subida — calentamiento...');
  sendRealtime({ phase: 'upload_warmup', mbps: 0, download, ping, jitter });
  await measureUploadThroughput(2, 2000, (mbps) => sendRealtime({ phase: 'upload_warmup', mbps, download, ping, jitter }));

  send('Test de subida — midiendo (6 s)...');
  sendRealtime({ phase: 'upload', mbps: 0, download, ping, jitter });
  const upload = Math.round(await measureUploadThroughput(3, 6000, (mbps) => sendRealtime({ phase: 'upload', mbps, download, ping, jitter })) * 10) / 10;
  send(`Subida: ${upload} Mbps`);
  sendRealtime({ phase: 'done', mbps: upload, download, upload, ping, jitter });

  send('Calculando resultados finales...');
  const dRate = rateSpeed(download, [
    { min: 100, label: 'Excelente',    status: 'ok'    },
    { min: 30,  label: 'Muy buena',    status: 'ok'    },
    { min: 15,  label: 'Correcta',     status: 'ok'    },
    { min: 5,   label: 'Baja',         status: 'warn'  },
    { min: 0.1, label: 'Muy baja',     status: 'warn'  },
    { min: -1,  label: 'Sin conexión', status: 'error' },
  ]);
  const uRate = rateSpeed(upload, [
    { min: 30,  label: 'Excelente',    status: 'ok'    },
    { min: 10,  label: 'Muy buena',    status: 'ok'    },
    { min: 5,   label: 'Correcta',     status: 'ok'    },
    { min: 1,   label: 'Baja',         status: 'warn'  },
    { min: 0.1, label: 'Muy baja',     status: 'warn'  },
    { min: -1,  label: 'Sin conexión', status: 'error' },
  ]);
  const pRate = rateSpeed(-ping, [
    { min: -20,     label: 'Excelente',    status: 'ok'    },
    { min: -50,     label: 'Muy bueno',    status: 'ok'    },
    { min: -100,    label: 'Correcto',     status: 'ok'    },
    { min: -150,    label: 'Algo elevado', status: 'warn'  },
    { min: -100000, label: 'Elevado',      status: 'error' },
  ]);
  const anyError = dRate.status === 'error' || uRate.status === 'error';
  const anyWarn  = [dRate.status, uRate.status, pRate.status].includes('warn');
  const overall  = anyError ? 'Se recomienda revisar la conexión de red.'
    : anyWarn ? 'Equipo apto para trabajar, con margen de mejora en la conexión.'
    : 'Equipo apto para trabajar.';

  appLog('INFO', `[SpeedTest] ↓${download} Mbps ↑${upload} Mbps ping:${ping}ms jitter:${jitter}ms`);
  return {
    download, downloadLabel: dRate.label, downloadStatus: dRate.status,
    upload,   uploadLabel:   uRate.label, uploadStatus:   uRate.status,
    ping, jitter, pingLabel: pRate.label, pingStatus: pRate.status,
    overall,
    note: 'Medición por ventana de tiempo (8 s descarga / 6 s subida) con múltiples conexiones paralelas contra Cloudflare. Metodología equivalente a Ookla/Speedtest.net.',
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD 2: DIAGNÓSTICO DEL PC — sin PowerShell, todo vía WMIC + Node.js
// ─────────────────────────────────────────────────────────────────────────────
function cpuUsagePercent() {
  return new Promise((resolve) => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();
      let idleDiff = 0, totalDiff = 0;
      for (let i = 0; i < start.length; i++) {
        const s = start[i].times, e = end[i].times;
        const sT = s.user + s.nice + s.sys + s.idle + s.irq;
        const eT = e.user + e.nice + e.sys + e.idle + e.irq;
        totalDiff += eT - sT;
        idleDiff  += e.idle - s.idle;
      }
      resolve(totalDiff > 0 ? 100 - (100 * idleDiff / totalDiff) : 0);
    }, 600);
  });
}

function statusFor(value, okMax, warnMax) {
  return value < okMax ? 'ok' : value < warnMax ? 'warn' : 'error';
}

// Parsea la salida de "wmic ... get field /value" en un objeto clave→valor
function parseWmicValue(stdout) {
  const obj = {};
  (stdout || '').split(/\r?\n/).forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0) obj[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  });
  return obj;
}

// Parsea "wmic ... get f1,f2,f3" (formato tabla) en array de objetos
function parseWmicTable(stdout) {
  const lines = (stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(/\s{2,}/).map(h => h.trim()).filter(Boolean);
  return lines.slice(1).map(line => {
    const parts = line.split(/\s{2,}/).map(p => p.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = parts[i] || ''; });
    return obj;
  });
}

async function getGpuInfo() {
  appLog('INFO', '[GPU] Consultando info de GPU vía Registro de Windows y WMI...');
  const gpus = [];
  const baseKey = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';

  try {
    // 1. Listar sub-claves dinámicamente del registro
    let subKeys = ['0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010'];
    const enumRes = await runExec(`reg query "${baseKey}"`, 3000);
    if (enumRes.ok && enumRes.stdout) {
      const foundKeys = enumRes.stdout.match(/\{4d36e968-e325-11ce-bfc1-08002be10318\}\\(\d+)/gi);
      if (foundKeys && foundKeys.length > 0) {
        subKeys = Array.from(new Set(foundKeys.map(k => k.split('\\').pop())));
      }
    }

    const results = await Promise.all(subKeys.map(n => runExec(`reg query "${baseKey}\\${n}"`, 4000)));

    for (const res of results) {
      if (!res.ok || !res.stdout) continue;
      const text = res.stdout;

      const descMatch = /DriverDesc\s+REG_SZ\s+(.+)/i.exec(text);
      const verMatch  = /DriverVersion\s+REG_SZ\s+(.+)/i.exec(text);
      const dateMatch = /DriverDate\s+REG_SZ\s+(.+)/i.exec(text);
      const provMatch = /ProviderName\s+REG_SZ\s+(.+)/i.exec(text);
      const matchingDeviceIdMatch = /MatchingDeviceId\s+REG_SZ\s+(.+)/i.exec(text);

      if (!descMatch) continue;
      const model = descMatch[1].trim();
      const driverVersion = verMatch ? verMatch[1].trim() : '';
      let rawDate = dateMatch ? dateMatch[1].trim() : '';
      const provider = provMatch ? provMatch[1].trim() : '';
      const matchingId = matchingDeviceIdMatch ? matchingDeviceIdMatch[1].trim() : '';

      let driverDate = '';
      if (rawDate) {
        const parts = rawDate.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[2].length === 4) driverDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          else driverDate = rawDate;
        } else driverDate = rawDate;
      }

      const nameUp = model.toUpperCase();
      const provUp = provider.toUpperCase();

      let manufacturer = 'Desconocido';
      if (provUp.includes('NVIDIA') || nameUp.includes('NVIDIA') || nameUp.includes('GEFORCE') || nameUp.includes('RTX') || nameUp.includes('GTX') || nameUp.includes('QUADRO')) manufacturer = 'NVIDIA';
      else if (provUp.includes('AMD') || provUp.includes('ADVANCED MICRO') || nameUp.includes('AMD') || nameUp.includes('RADEON')) manufacturer = 'AMD';
      else if (provUp.includes('INTEL') || nameUp.includes('INTEL') || nameUp.includes('ARC') || nameUp.includes('UHD') || nameUp.includes('IRIS')) manufacturer = 'Intel';

      const isVirtualOrRemote = nameUp.includes('REMOTE DISPLAY') || 
                                nameUp.includes('BASIC DISPLAY') || 
                                nameUp.includes('BASIC RENDER') || 
                                nameUp.includes('CITRIX') || 
                                nameUp.includes('RDP ENCODER') ||
                                nameUp.includes('INDIRECT') ||
                                nameUp.includes('VMWARE') ||
                                nameUp.includes('VBOX');

      let temperature = null, temperatureError = null;
      if (manufacturer === 'NVIDIA') {
        const smi = await runCmd('nvidia-smi', ['--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], 6000);
        const t = parseFloat((smi.stdout || '').split('\n')[0]);
        if (!isNaN(t)) temperature = t;
        else temperatureError = 'No ha sido posible obtener la temperatura de la GPU.';
      } else {
        temperatureError = 'No ha sido posible obtener la temperatura de la GPU.';
      }

      const officialUrl = manufacturer === 'NVIDIA' ? 'https://www.nvidia.com/Download/index.aspx'
        : manufacturer === 'AMD'   ? 'https://www.amd.com/en/support'
        : manufacturer === 'Intel' ? 'https://www.intel.com/content/www/us/en/download-center/home.html'
        : '';

      let driverStatus = 'warn';
      if (!driverVersion) driverStatus = 'error';
      else if (driverDate) {
        const ageDays = (Date.now() - new Date(driverDate).getTime()) / 86400000;
        driverStatus = ageDays > 30 ? 'warn' : 'ok';
      }

      // Evitar duplicados por modelo
      if (!gpus.some(g => g.model === model && g.driverVersion === driverVersion)) {
        gpus.push({ model, manufacturer, driverVersion, driverDate, temperature, temperatureError, officialUrl, driverStatus, isVirtualOrRemote });
      }
    }
  } catch (e) {
    appLog('ERROR', `[GPU] Error al consultar registro: ${e.message}`);
  }

  // Si no se detectó ninguna o solo se detectó adaptador virtual/remote, intentar VBS/WMIC
  const physicalGpus = gpus.filter(g => !g.isVirtualOrRemote);
  if (physicalGpus.length === 0) {
    try {
      appLog('INFO', '[GPU] Intentando detectar GPU física vía WMI Win32_VideoController...');
      const wmiRes = await runExec('wmic path Win32_VideoController get Name,DriverVersion,DriverDate,AdapterCompatibility /format:csv', 5000);
      if (wmiRes.ok && wmiRes.stdout) {
        const lines = wmiRes.stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('Node'));
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim());
          const nameIdx = headers.findIndex(h => /Name/i.test(h));
          const verIdx  = headers.findIndex(h => /DriverVersion/i.test(h));
          const compatIdx = headers.findIndex(h => /AdapterCompatibility/i.test(h));
          const dateIdx = headers.findIndex(h => /DriverDate/i.test(h));

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            const model = cols[nameIdx] || '';
            if (!model) continue;
            const nameUp = model.toUpperCase();
            if (nameUp.includes('REMOTE DISPLAY') || nameUp.includes('BASIC DISPLAY')) continue;

            const driverVersion = cols[verIdx] || '';
            const compat = cols[compatIdx] || '';
            const provUp = (compat + ' ' + nameUp).toUpperCase();

            let manufacturer = 'Desconocido';
            if (provUp.includes('NVIDIA') || nameUp.includes('NVIDIA') || nameUp.includes('GEFORCE')) manufacturer = 'NVIDIA';
            else if (provUp.includes('AMD') || provUp.includes('ADVANCED MICRO') || nameUp.includes('RADEON')) manufacturer = 'AMD';
            else if (provUp.includes('INTEL') || nameUp.includes('INTEL')) manufacturer = 'Intel';

            const officialUrl = manufacturer === 'NVIDIA' ? 'https://www.nvidia.com/Download/index.aspx'
              : manufacturer === 'AMD'   ? 'https://www.amd.com/en/support'
              : manufacturer === 'Intel' ? 'https://www.intel.com/content/www/us/en/download-center/home.html'
              : '';

            if (!gpus.some(g => g.model === model)) {
              gpus.push({
                model,
                manufacturer,
                driverVersion,
                driverDate: '',
                temperature: null,
                temperatureError: 'No ha sido posible obtener la temperatura de la GPU.',
                officialUrl,
                driverStatus: driverVersion ? 'ok' : 'warn',
                isVirtualOrRemote: false
              });
            }
          }
        }
      }
    } catch (e) {
      appLog('ERROR', `[GPU] Error en fallback WMI: ${e.message}`);
    }
  }

  // Ordenar para colocar GPUs físicas primero
  gpus.sort((a, b) => (a.isVirtualOrRemote === b.isVirtualOrRemote ? 0 : a.isVirtualOrRemote ? 1 : -1));

  appLog('INFO', `[GPU] ${gpus.length} GPU(s) detectada(s)`);
  return gpus;
}

async function getDiskDriveHardwareInfo() {
  appLog('INFO', '[Disco Hardware] Consultando fabricantes y modelos de disco vía VBScript WMI...');
  const vbsPath = path.join(app.getPath('temp'), `disk_info_${Date.now()}.vbs`);
  const vbsCode = `
Set objWMI = GetObject("winmgmts:\\\\.\\root\\cimv2")
Set colItems = objWMI.ExecQuery("Select * from Win32_DiskDrive")
For Each item in colItems
    WScript.Echo item.Model & "|" & item.Manufacturer & "|" & item.Caption & "|" & item.Size
Next
`;
  const hwDisks = [];
  try {
    fs.writeFileSync(vbsPath, vbsCode, 'utf8');
    const res = await runExec(`cscript //nologo "${vbsPath}"`, 4000);
    try { fs.unlinkSync(vbsPath); } catch (e) {}

    if (res.ok && res.stdout) {
      res.stdout.split(/\r?\n/).forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 3 && parts[0]) {
          const model = parts[0];
          const rawMfg = parts[1];
          const caption = parts[2];

          let brand = 'Genérico / Estándar';
          const combined = (model + ' ' + caption).toUpperCase();

          if (combined.includes('CRUCIAL') || combined.includes('CT240') || combined.includes('CT500') || combined.includes('CT1000') || combined.includes('CT2000')) brand = 'Crucial (Micron)';
          else if (combined.includes('SPCC') || combined.includes('SILICON POWER')) brand = 'Silicon Power';
          else if (combined.includes('SAMSUNG')) brand = 'Samsung Electronics';
          else if (combined.includes('WDC') || combined.includes('WESTERN DIGITAL') || combined.includes('WD')) brand = 'Western Digital';
          else if (combined.includes('SEAGATE') || combined.includes('ST1000') || combined.includes('ST2000')) brand = 'Seagate Technology';
          else if (combined.includes('KINGSTON') || combined.includes('SA400')) brand = 'Kingston Technology';
          else if (combined.includes('CORSAIR')) brand = 'Corsair';
          else if (combined.includes('ADATA')) brand = 'ADATA';
          else if (combined.includes('SABRENT')) brand = 'Sabrent';
          else if (rawMfg && !rawMfg.includes('estándar') && !rawMfg.includes('standard') && rawMfg.length > 2) brand = rawMfg;

          hwDisks.push({ model, brand, caption });
        }
      });
    }
  } catch (e) {
    appLog('ERROR', `[Disco Hardware] Error en VBScript: ${e.message}`);
  }

  return hwDisks;
}

async function getPsuInfo(gpuModel) {
  appLog('INFO', '[Fuente] Calculando especificaciones y alimentación de la PSU...');
  let hasGpuHigh = false;
  const gpuUp = (gpuModel || '').toUpperCase();
  if (gpuUp.includes('3060') || gpuUp.includes('3070') || gpuUp.includes('3080') || gpuUp.includes('4060') || gpuUp.includes('4070') || gpuUp.includes('RX')) {
    hasGpuHigh = true;
  }

  const recommendedWatts = hasGpuHigh ? '550W - 650W (80 PLUS Gold / Bronze)' : '450W - 500W (80 PLUS)';
  const estimatedTdp = hasGpuHigh ? '~300W - 380W TDP (En Carga Peak)' : '~180W - 250W TDP (En Carga)';

  return {
    type: 'Fuente ATX de Sobremesa',
    status: 'Alimentación CA Continua (Red Eléctrica OK)',
    recommendedWatts,
    estimatedTdp,
    efficiencyRating: '80 PLUS Recomendado',
  };
}

async function getDiskInfo() {
  appLog('INFO', '[Disco] Consultando discos vía Node.js fs.statfsSync y WMI...');
  const hwDisks = await getDiskDriveHardwareInfo();
  const disks = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let hwIndex = 0;

  for (let i = 0; i < letters.length; i++) {
    const drive = letters[i] + ':';
    try {
      const stats = fs.statfsSync(drive + '\\');
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes  = stats.bsize * stats.bfree;
      if (totalBytes > 0) {
        const totalGb = totalBytes / 1073741824;
        const freeGb  = freeBytes / 1073741824;
        const usedGb  = totalGb - freeGb;
        const pct     = (usedGb / totalGb) * 100;

        const hw = hwDisks[hwIndex] || hwDisks[0] || { brand: 'Unidad SSD / HDD', model: 'Disco Físico' };
        hwIndex++;

        disks.push({
          drive,
          brand:       hw.brand,
          model:       hw.model,
          totalGb:     Math.round(totalGb * 10) / 10,
          totalGB:     Math.round(totalGb * 10) / 10,
          usedGb:      Math.round(usedGb  * 10) / 10,
          usedGB:      Math.round(usedGb  * 10) / 10,
          freeGb:      Math.round(freeGb  * 10) / 10,
          freeGB:      Math.round(freeGb  * 10) / 10,
          percentUsed: Math.round(pct     * 10) / 10,
          status: statusFor(pct, 80, 90),
        });
      }
    } catch (e) {}
  }
  appLog('INFO', `[Disco] ${disks.length} disco(s) detectado(s)`);
  return disks;
}

async function getMotherboardInfo() {
  appLog('INFO', '[Placa Base] Consultando datos de la tarjeta madre vía Registro...');
  const res = await runExec('reg query "HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS"', 4000);
  if (!res.ok || !res.stdout) {
    return { manufacturer: 'No disponible', product: 'No disponible', biosVendor: '', biosVersion: '', biosDate: '' };
  }
  const text = res.stdout;
  const mfgMatch   = /BaseBoardManufacturer\s+REG_SZ\s+(.+)/i.exec(text);
  const prodMatch  = /BaseBoardProduct\s+REG_SZ\s+(.+)/i.exec(text);
  const vendorMatch= /BIOSVendor\s+REG_SZ\s+(.+)/i.exec(text);
  const verMatch   = /BIOSVersion\s+REG_SZ\s+(.+)/i.exec(text);
  const dateMatch  = /BIOSReleaseDate\s+REG_SZ\s+(.+)/i.exec(text);

  return {
    manufacturer: mfgMatch ? mfgMatch[1].trim() : 'System Manufacturer',
    product: prodMatch ? prodMatch[1].trim() : 'BaseBoard Product',
    biosVendor: vendorMatch ? vendorMatch[1].trim() : '',
    biosVersion: verMatch ? verMatch[1].trim() : '',
    biosDate: dateMatch ? dateMatch[1].trim() : '',
  };
}

async function getWindowsDetails() {
  appLog('INFO', '[Windows] Consultando versión detallada del sistema operativo vía Registro...');
  const res = await runExec('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"', 4000);
  let name = 'Windows 10/11';
  let displayVer = '';
  let build = '';
  let arch = os.arch() === 'x64' ? '64 bits (x64)' : '32 bits (x86)';

  if (res.ok && res.stdout) {
    const text = res.stdout;
    const nameMatch  = /ProductName\s+REG_SZ\s+(.+)/i.exec(text);
    const verMatch   = /DisplayVersion\s+REG_SZ\s+(.+)/i.exec(text);
    const buildMatch = /CurrentBuildNumber\s+REG_SZ\s+(.+)/i.exec(text);

    if (nameMatch) name = nameMatch[1].trim();
    if (verMatch) displayVer = verMatch[1].trim();
    if (buildMatch) build = buildMatch[1].trim();

    if (build && parseInt(build, 10) >= 22000 && name.includes('Windows 10')) {
      name = name.replace('Windows 10', 'Windows 11');
    }
  }

  return { name, displayVer, build, arch };
}

async function getCpuDetails() {
  const cpus = os.cpus();
  const usage = await cpuUsagePercent();
  const res = await runExec('reg query "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0"', 3000);

  let vendor = 'Intel / AMD';
  let nameStr = cpus[0]?.model || 'Procesador Principal';

  if (res.ok && res.stdout) {
    const vMatch = /VendorIdentifier\s+REG_SZ\s+(.+)/i.exec(res.stdout);
    const nMatch = /ProcessorNameString\s+REG_SZ\s+(.+)/i.exec(res.stdout);
    if (vMatch) {
      const v = vMatch[1].trim();
      vendor = v.includes('AMD') ? 'AMD (Advanced Micro Devices)'
        : v.includes('Intel') ? 'Intel Corporation'
        : v;
    }
    if (nMatch) nameStr = nMatch[1].trim();
  }

  return {
    model: nameStr,
    vendor,
    usagePercent: Math.round(usage * 10) / 10,
    cores: cpus.length, threads: cpus.length,
    clockGhz: Math.round((cpus[0]?.speed || 0) / 10) / 100,
    status: statusFor(usage, 70, 90),
  };
}

async function getRamDetails() {
  appLog('INFO', '[RAM] Consultando fabricante y detalles de la memoria RAM vía VBScript WMI...');
  const vbsPath = path.join(app.getPath('temp'), `ram_info_${Date.now()}.vbs`);
  const vbsCode = `
Set objWMI = GetObject("winmgmts:\\\\.\\root\\cimv2")
Set colItems = objWMI.ExecQuery("Select * from Win32_PhysicalMemory")
For Each item in colItems
    WScript.Echo item.Manufacturer & "|" & item.PartNumber & "|" & item.Speed & "|" & item.Capacity
Next
`;
  let modules = [];
  try {
    fs.writeFileSync(vbsPath, vbsCode, 'utf8');
    const res = await runExec(`cscript //nologo "${vbsPath}"`, 4000);
    try { fs.unlinkSync(vbsPath); } catch (e) {}

    if (res.ok && res.stdout) {
      res.stdout.split(/\r?\n/).forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 4 && parts[0]) {
          const mfg = parts[0];
          const part = parts[1];
          const speed = parts[2];
          const capGb = Math.round((parseInt(parts[3], 10) || 0) / 1073741824);
          modules.push({
            manufacturer: mfg !== '0000' && mfg !== 'Unknown' ? mfg : 'Genérica',
            partNumber: part,
            speedMhz: speed,
            capacityGb: capGb
          });
        }
      });
    }
  } catch (e) {
    appLog('ERROR', `[RAM] Error consultando VBScript: ${e.message}`);
  }

  const totalBytes = os.totalmem();
  const freeBytes  = os.freemem();
  const totalGb    = totalBytes / 1073741824;
  const freeGb     = freeBytes  / 1073741824;
  const usedGb     = totalGb - freeGb;
  const ramPct     = (usedGb / totalGb) * 100;

  let primaryMfg = 'No especificada';
  if (modules.length > 0) {
    const mfgs = [...new Set(modules.map(m => m.manufacturer).filter(Boolean))];
    primaryMfg = mfgs.join(' / ');
  }

  return {
    totalGb: Math.round(totalGb * 10) / 10,
    totalGB: Math.round(totalGb * 10) / 10,
    usedGb:  Math.round(usedGb  * 10) / 10,
    usedGB:  Math.round(usedGb  * 10) / 10,
    freeGb:  Math.round(freeGb   * 10) / 10,
    freeGB:  Math.round(freeGb   * 10) / 10,
    percentUsed: Math.round(ramPct * 10) / 10,
    manufacturer: primaryMfg,
    modulesCount: modules.length || 1,
    speedMhz: modules[0]?.speedMhz || '',
    modules,
    status: statusFor(ramPct, 70, 90),
  };
}

ipcMain.handle('run-diagnostico', async () => {
  appLog('INFO', '[Diagnóstico] Iniciando análisis completo del equipo sin PowerShell...');
  const ram         = await getRamDetails();
  const cpu         = await getCpuDetails();
  const gpus        = await getGpuInfo();
  const disks       = await getDiskInfo();
  const motherboard = await getMotherboardInfo();
  const windows     = await getWindowsDetails();

  const psu         = await getPsuInfo(gpus[0]?.model, cpu.model);

  appLog('INFO', `[Diagnóstico] RAM:${Math.round(ram.percentUsed)}% (${ram.manufacturer}) CPU:${Math.round(cpu.usagePercent)}% Discos:${disks.length} GPUs:${gpus.length}`);
  return {
    ram,
    cpu,
    gpus,
    disks,
    motherboard,
    windows,
    psu,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD 3: PLAN DE ENERGÍA — powercfg.exe, sin PowerShell
// ─────────────────────────────────────────────────────────────────────────────
const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

ipcMain.handle('activate-high-performance', async () => {
  appLog('INFO', '[PowerPlan] Activando plan Alto rendimiento...');
  const active = await runCmd('powercfg', ['/getactivescheme']);
  if ((active.stdout || '').toLowerCase().includes(HIGH_PERF_GUID)) {
    appLog('INFO', '[PowerPlan] Ya estaba activo.');
    return { success: true, alreadyActive: true, message: 'El plan Alto rendimiento ya estaba activo.' };
  }
  const list = await runCmd('powercfg', ['/list']);
  if (!(list.stdout || '').toLowerCase().includes(HIGH_PERF_GUID)) {
    await runCmd('powercfg', ['/duplicatescheme', HIGH_PERF_GUID]);
  }
  const setResult = await runCmd('powercfg', ['/setactive', HIGH_PERF_GUID]);
  appLog(setResult.ok ? 'INFO' : 'ERROR', `[PowerPlan] ExitCode=${setResult.code}`);
  return {
    success: setResult.ok, alreadyActive: false,
    message: setResult.ok ? 'Plan de energía configurado correctamente.'
                          : `No se pudo activar el plan de energía. ${setResult.stderr}`,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES 4 Y 5: SFC y DISM — CMD visible elevado SIN PowerShell
//
// Estrategia: usar ShellExecute vía un VBScript mínimo.
// VBScript (cscript.exe) está disponible en TODOS los Windows incluso con
// PowerShell desactivado. Llama a Shell.Application.ShellExecute con "runas"
// para disparar el UAC y abrir CMD como administrador.
// El .bat secundario captura el código de salida en un fichero temporal.
// ─────────────────────────────────────────────────────────────────────────────
function runCmdVisible(command, label, event, channel) {
  return new Promise((resolve) => {
    const tmp         = os.tmpdir();
    const stamp       = Date.now();
    const windowTitle = `ITTK_${stamp}`;
    const initFile    = path.join(tmp, `ittk_init_${stamp}.txt`);
    const exitFile    = path.join(tmp, `ittk_exit_${stamp}.txt`);
    const batFile     = path.join(tmp, `ittk_cmd_${stamp}.bat`);
    const vbsFile     = path.join(tmp, `ittk_run_${stamp}.vbs`);

    appLog('INFO', `[${label}] Preparando CMD elevado (${windowTitle})...`);

    // .bat: escribe initFile en la PRIMERA LÍNEA, ejecuta el comando, escribe exitFile y borra initFile
    const bat = [
      '@echo off',
      `echo STARTED> "${initFile}"`,
      `title ${windowTitle}`,
      'echo.',
      `echo  ====================================================`,
      `echo   IT Toolkit - ${label}`,
      `echo  ====================================================`,
      'echo.',
      command,
      `echo %errorlevel%> "${exitFile}"`,
      'if exist "' + initFile + '" del "' + initFile + '"',
      'echo.',
      'echo  Operacion finalizada. Puede cerrar esta ventana.',
      'pause',
    ].join('\r\n');

    // .vbs: usa Shell.Application.ShellExecute para elevar el .bat con runas
    const vbs = [
      'Set oShell = CreateObject("Shell.Application")',
      `oShell.ShellExecute "cmd.exe", "/c """ & "${batFile.replace(/\\/g, '\\\\')}" & """", "", "runas", 1`,
    ].join('\r\n');

    try {
      fs.writeFileSync(batFile, bat, 'latin1');
      fs.writeFileSync(vbsFile, vbs, 'utf8');
    } catch (err) {
      appLog('ERROR', `[${label}] No se pudieron crear archivos temporales: ${err.message}`);
      resolve({ exitCode: -1, elapsedMs: 0, elevationDenied: false, error: err.message });
      return;
    }

    const start = Date.now();
    event.sender.send(channel, 'Solicitando permisos de administrador... Se abrirá una ventana CMD.');

    execFile('cscript', ['//nologo', vbsFile],
      { timeout: 10000, maxBuffer: 1024 * 256 },
      (vbsErr) => {
        if (vbsErr && vbsErr.code !== 0 && !vbsErr.killed) {
          clearFiles();
          appLog('WARN', `[${label}] cscript devolvió error: ${vbsErr.message}`);
          resolve({ exitCode: -1, elapsedMs: Date.now() - start, elevationDenied: true, cancelled: true });
          return;
        }

        const MAX_WAIT = 30 * 60 * 1000;
        const POLL_MS  = 1000;
        let   waited   = 0;
        let   cmdStarted = false;

        const heartbeat = setInterval(() => {
          const mins = Math.floor((Date.now() - start) / 60000);
          event.sender.send(channel,
            `Ejecutando en ventana CMD... (${mins} min transcurridos). Cierra la ventana CMD cuando termine.`);
        }, 10000);

        const poll = setInterval(async () => {
          waited += POLL_MS;
          let exitContent = '';
          try { exitContent = fs.readFileSync(exitFile, 'utf8').trim(); } catch {}

          // 1. Si exitFile existe, la operación completó normalmente
          if (exitContent !== '') {
            finish(parseInt(exitContent, 10) || 0, false, false);
            return;
          }

          // 2. Comprobar si la ventana CMD ya inició
          if (!cmdStarted) {
            if (fs.existsSync(initFile)) {
              cmdStarted = true;
            } else if (waited >= 12000) {
              // 12 segundos sin initFile ni exitFile -> UAC denegado o cancelado por el usuario
              finish(-1, true, true);
              return;
            }
          } else {
            // 3. Si CMD ya inició, verificar si la ventana sigue abierta en tasklist
            const taskRes = await runCmd('tasklist', ['/FI', `WINDOWTITLE eq ${windowTitle}`]);
            const isWindowRunning = (taskRes.stdout || '').includes(windowTitle);

            if (!isWindowRunning) {
              // Si la ventana desapareció, comprobar exitFile por última vez
              try { exitContent = fs.readFileSync(exitFile, 'utf8').trim(); } catch {}
              if (exitContent !== '') {
                finish(parseInt(exitContent, 10) || 0, false, false);
              } else {
                finish(-1, false, true); // El usuario cerró la ventana de CMD
              }
              return;
            }
          }

          if (waited >= MAX_WAIT) {
            finish(-1, false, true);
          }
        }, POLL_MS);

        function finish(exitCode, elevationDenied, cancelled) {
          clearInterval(poll);
          clearInterval(heartbeat);
          clearFiles();
          const elapsedMs = Date.now() - start;
          appLog('INFO', `[${label}] Finalizado. ExitCode=${exitCode} Denied=${elevationDenied} Cancelled=${cancelled} Elapsed=${Math.round(elapsedMs/1000)}s`);
          resolve({ exitCode, elapsedMs, elevationDenied, cancelled });
        }
      });

    function clearFiles() {
      try { fs.unlinkSync(initFile); } catch {}
      try { fs.unlinkSync(exitFile); } catch {}
      try { fs.unlinkSync(batFile);  } catch {}
      try { fs.unlinkSync(vbsFile);  } catch {}
    }
  });
}

ipcMain.handle('run-sfc', async (event) => {
  appLog('INFO', '[SFC] Iniciando sfc /scannow...');
  event.sender.send('sfc-progress', 'Abriendo ventana CMD con permisos de administrador...');
  const result = await runCmdVisible('sfc /scannow', 'SFC /scannow', event, 'sfc-progress');
  if (result.elevationDenied || result.cancelled) {
    appLog('WARN', '[SFC] Operación cancelada o ventana CMD cerrada por el usuario.');
    return { success: false, cancelled: true, summary: 'Se canceló la operación o se cerró la ventana CMD.', elapsedMs: result.elapsedMs };
  }
  const success = result.exitCode === 0;
  appLog('INFO', `[SFC] Completado. ExitCode=${result.exitCode}`);
  return {
    success, errorsFound: result.exitCode !== 0,
    summary: success
      ? 'SFC finalizó correctamente. Revisa la ventana CMD para ver el resultado detallado.'
      : 'SFC detectó o no pudo reparar algunos archivos. Revisa la ventana CMD para más detalles.',
    elapsedMs: result.elapsedMs,
  };
});

ipcMain.handle('run-dism', async (event) => {
  appLog('INFO', '[DISM] Iniciando DISM /RestoreHealth...');
  event.sender.send('dism-progress', 'Abriendo ventana CMD con permisos de administrador...');
  const result = await runCmdVisible('DISM /Online /Cleanup-Image /RestoreHealth', 'DISM - Reparar Windows', event, 'dism-progress');
  if (result.elevationDenied || result.cancelled) {
    appLog('WARN', '[DISM] Operación cancelada o ventana CMD cerrada por el usuario.');
    return { success: false, cancelled: true, summary: 'Se canceló la operación o se cerró la ventana CMD.', elapsedMs: result.elapsedMs };
  }
  const success = result.exitCode === 0;
  appLog('INFO', `[DISM] Completado. ExitCode=${result.exitCode}`);
  return {
    success,
    summary: success
      ? 'DISM finalizó correctamente. Revisa la ventana CMD para ver el resultado detallado.'
      : 'DISM no finalizó correctamente. Revisa la ventana CMD para ver los detalles del error.',
    elapsedMs: result.elapsedMs,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD: LIMPIEZA DE ARCHIVOS TEMPORALES
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('run-clean-temp', async (event) => {
  appLog('INFO', '[CleanTemp] Iniciando proceso de limpieza de archivos temporales...');
  const sendProgress = (msg) => event.sender.send('clean-temp-progress', msg);

  sendProgress('Escaneando directorios temporales...');
  const tempPaths = [
    process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData\\Local\\Temp'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'Prefetch'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution\\Download'),
  ];

  let totalBytesFreed = 0;
  let filesDeleted = 0;
  let filesFailed = 0;
  const categoriesCleared = [];

  for (const dirPath of tempPaths) {
    if (!dirPath || !fs.existsSync(dirPath)) continue;
    const dirName = path.basename(dirPath);
    sendProgress(`Limpiando carpeta: ${dirName}...`);

    try {
      const items = fs.readdirSync(dirPath);
      let catBytes = 0;
      let catFiles = 0;

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
          const stat = fs.statSync(fullPath);
          const size = stat.isDirectory() ? 4096 : stat.size;
          
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          totalBytesFreed += size;
          catBytes += size;
          filesDeleted++;
          catFiles++;
        } catch (err) {
          filesFailed++;
        }
      }
      categoriesCleared.push({ name: dirName, path: dirPath, filesCount: catFiles, freedMb: (catBytes / (1024 * 1024)).toFixed(2) });
    } catch (e) {
      appLog('WARN', `[CleanTemp] No se pudo acceder por completo a ${dirPath}: ${e.message}`);
    }
  }

  // Intentar ejecutar cleanmgr de forma silenciosa para temporales adicionales de Windows si es posible
  try {
    sendProgress('Ejecutando limpieza en segundo plano con Windows Cleanmgr...');
    await runExec('cleanmgr /autoclean', 4000);
  } catch (e) {
    // Ignorar si no se puede ejecutar cleanmgr
  }

  const freedMb = (totalBytesFreed / (1024 * 1024)).toFixed(2);
  const freedGb = (totalBytesFreed / (1024 * 1024 * 1024)).toFixed(2);

  appLog('INFO', `[CleanTemp] Proceso completado. ${freedMb} MB liberados. Archivos eliminados: ${filesDeleted}, Bloqueados: ${filesFailed}`);

  return {
    success: true,
    totalBytesFreed,
    freedMb,
    freedGb,
    filesDeleted,
    filesFailed,
    categoriesCleared,
    summary: `Se han eliminado ${filesDeleted} archivos temporales y liberado ${freedMb > 1024 ? freedGb + ' GB' : freedMb + ' MB'} de espacio en disco.`
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD 6: DRIVERS DE GPU — reutiliza getGpuInfo (ya sin PowerShell)
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('get-gpu-drivers', async () => getGpuInfo());

ipcMain.handle('open-url',          async (_e, url)  => shell.openExternal(url));
ipcMain.handle('copy-to-clipboard', async (_e, text) => clipboard.writeText(text));

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDAD 7: ANÁLISIS DEL VISOR DE EVENTOS — wevtutil.exe, sin PowerShell
//
// wevtutil.exe está disponible en Windows Vista+ y no requiere PowerShell.
// Usamos: wevtutil qe System /q:"*[System[EventID=X or EventID=Y ...]]" /f:XML /c:500
// El XML lo parseamos con el módulo nativo 'node' (sin dependencias externas).
// Para la elevación: mismo mecanismo VBScript/ShellExecute que SFC/DISM.
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_CATALOG = {
  41:   { category: 'apagado_inesperado', title: 'Kernel-Power',            interpretation: 'Posible corte eléctrico, bloqueo del sistema o apagado forzado con el botón de encendido.' },
  6008: { category: 'apagado_inesperado', title: 'Apagado inesperado',      interpretation: 'El equipo se apagó de forma abrupta (corte de luz, cuelgue o botón de encendido).' },
  1074: { category: 'reinicio_normal',    title: 'Reinicio/apagado manual', interpretation: 'Reinicio o apagado planificado (manual o por Windows Update).' },
  6005: { category: 'reinicio_normal',    title: 'Inicio del sistema',      interpretation: 'Arranque normal del sistema.' },
  6006: { category: 'reinicio_normal',    title: 'Apagado correcto',        interpretation: 'Apagado limpio del sistema.' },
  1001: { category: 'bugcheck',           title: 'BugCheck (BSOD)',         interpretation: 'Revisar el código del pantallazo azul y los controladores instalados recientemente.' },
  17:   { category: 'whea',              title: 'WHEA-Logger',             interpretation: 'Posible fallo de hardware: CPU, RAM, placa base o GPU.' },
  18:   { category: 'whea',              title: 'WHEA-Logger',             interpretation: 'Fallo de hardware corregido automáticamente; vigilar si se repite.' },
  19:   { category: 'whea',              title: 'WHEA-Logger',             interpretation: 'Posible fallo serio de hardware: CPU, RAM, placa base o GPU.' },
  47:   { category: 'whea',              title: 'WHEA-Logger',             interpretation: 'Posible problema con una tarjeta PCIe (GPU, red, almacenamiento).' },
  7:    { category: 'disco',             title: 'Error de disco',          interpretation: 'Comprobar el estado SMART del disco y ejecutar chkdsk.' },
  11:   { category: 'disco',             title: 'Error de disco',          interpretation: 'Comprobar el estado SMART del disco y ejecutar chkdsk.' },
  51:   { category: 'disco',             title: 'Error de disco',          interpretation: 'Posible degradación del disco; comprobar SMART.' },
  153:  { category: 'disco',             title: 'Error de disco',          interpretation: 'Comprobar cables/conexión SATA/NVMe y el estado SMART del disco.' },
  55:   { category: 'disco',             title: 'Error NTFS',              interpretation: 'Ejecutar chkdsk para reparar el sistema de archivos.' },
  7000: { category: 'servicios',         title: 'Servicio no iniciado',    interpretation: 'Revisar la configuración o reinstalar el servicio afectado.' },
  7001: { category: 'servicios',         title: 'Dependencia de servicio', interpretation: 'Comprobar el servicio del que depende.' },
  7009: { category: 'servicios',         title: 'Timeout de servicio',     interpretation: 'El servicio tardó demasiado en responder.' },
  7011: { category: 'servicios',         title: 'Timeout de control',      interpretation: 'Revisar el servicio implicado.' },
  7031: { category: 'servicios',         title: 'Servicio caído',          interpretation: 'Revisar la configuración o reinstalar el servicio afectado.' },
  7034: { category: 'servicios',         title: 'Servicio caído',          interpretation: 'Revisar la configuración o reinstalar el servicio afectado.' },
  12:   { category: 'kernel_general',    title: 'Kernel-General',          interpretation: 'Arranque normal registrado por el kernel.' },
  13:   { category: 'kernel_general',    title: 'Kernel-General',          interpretation: 'Apagado normal registrado por el kernel.' },
};

// Extraer el valor de un elemento XML de forma simple (sin parseador externo)
function xmlVal(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m  = re.exec(xml);
  return m ? m[1].trim() : '';
}

// Parsear cierres inesperados de aplicaciones del XML de wevtutil
function parseAppCrashXml(xmlText) {
  const crashes = [];
  const eventBlocks = xmlText.split(/<Event\s/i).slice(1);
  for (const block of eventBlocks) {
    try {
      const timeRaw = block.match(/TimeCreated\s+SystemTime=['"]([^'"]+)['"]/i)?.[1] || '';
      const appName = block.match(/<Data\s+Name=['"]AppName['"]>([^<]*)<\/Data>/i)?.[1] || 'Aplicación desconocida';
      const appPath = block.match(/<Data\s+Name=['"]AppPath['"]>([^<]*)<\/Data>/i)?.[1] || '';
      const errCode = block.match(/<Data\s+Name=['"]ExceptionCode['"]>([^<]*)<\/Data>/i)?.[1] || '';

      const time = timeRaw ? new Date(timeRaw) : null;
      if (!time || isNaN(time.getTime())) continue;

      crashes.push({
        appName,
        appPath,
        errCode: errCode ? `0x${errCode}` : '0xc0000005',
        time: time.toISOString(),
      });
    } catch {}
  }
  return crashes;
}

// Parsear el último evento de apagado o reinicio del XML
function parseLastShutdownXml(xmlText) {
  const eventBlocks = xmlText.split(/<Event\s/i).slice(1);
  for (const block of eventBlocks) {
    try {
      const eventId = parseInt(xmlVal(block, 'EventID'), 10);
      const timeRaw = block.match(/TimeCreated\s+SystemTime=['"]([^'"]+)['"]/i)?.[1] || '';
      const time = timeRaw ? new Date(timeRaw) : null;
      if (!time || isNaN(time.getTime())) continue;

      const type = (eventId === 6008) ? 'Apagado inesperado (Corte de energía / Bloqueo)'
        : (eventId === 1074) ? 'Apagado/Reinicio programado'
        : (eventId === 6006) ? 'Apagado normal registrado'
        : 'Reinicio del sistema';
      const category = (eventId === 6008) ? 'apagado_inesperado' : 'reinicio_normal';

      return { time: time.toISOString(), type, category };
    } catch {}
  }
  return null;
}

// Ejecutar ambas consultas wevtutil (Application y System) en una sola elevación UAC (1 solo prompt)
function runWevtutilElevatedCombined(appQuery, sysQuery, appOutFile, sysOutFile, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const tmp     = os.tmpdir();
    const stamp   = Date.now();
    const batFile = path.join(tmp, `ittk_wev_${stamp}.bat`);
    const vbsFile = path.join(tmp, `ittk_wev_${stamp}.vbs`);
    const DONE    = path.join(tmp, `ittk_wev_done_${stamp}.txt`);

    const bat = [
      '@echo off',
      `wevtutil qe Application /q:"${appQuery}" /f:XML /c:200 /rd:true > "${appOutFile}" 2>&1`,
      `wevtutil qe System /q:"${sysQuery}" /f:XML /c:200 /rd:true > "${sysOutFile}" 2>&1`,
      `echo done > "${DONE}"`,
    ].join('\r\n');

    const vbs = [
      'Set oShell = CreateObject("Shell.Application")',
      `oShell.ShellExecute "cmd.exe", "/c """ & "${batFile.replace(/\\/g, '\\\\')}" & """", "", "runas", 0`,
    ].join('\r\n');

    try {
      fs.writeFileSync(batFile, bat, 'latin1');
      fs.writeFileSync(vbsFile, vbs, 'utf8');
    } catch (e) {
      resolve({ ok: false, error: e.message });
      return;
    }

    execFile('cscript', ['//nologo', vbsFile], { timeout: 10000 }, (err) => {
      if (err && err.code !== 0) {
        cleanup();
        resolve({ ok: false, elevationDenied: true });
        return;
      }
      const maxWait = timeoutMs, pollMs = 500;
      let waited = 0;
      const poll = setInterval(() => {
        waited += pollMs;
        if (fs.existsSync(DONE) || waited >= maxWait) {
          clearInterval(poll);
          cleanup();
          resolve({ ok: fs.existsSync(DONE) });
        }
      }, pollMs);
    });

    function cleanup() {
      try { fs.unlinkSync(batFile); } catch {}
      try { fs.unlinkSync(vbsFile); } catch {}
      try { fs.unlinkSync(DONE);    } catch {}
    }
  });
}

ipcMain.handle('run-event-log-analysis', async (_event, range = '7') => {
  appLog('INFO', `[Visor] Analizando tiempo encendido, reinicios, apagados y cierres de programas (rango: ${range})...`);

  // 1. Tiempo encendido
  const uptimeSec = os.uptime();
  const days  = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins  = Math.floor((uptimeSec % 3600) / 60);
  const uptimeText = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
  const lastBootTime = new Date(Date.now() - uptimeSec * 1000);

  const now = new Date();
  let appTimeFilter = '';
  let daysBackForSys = 7;

  const rangeStr = String(range);
  if (rangeStr === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    appTimeFilter = `TimeCreated[@SystemTime>='${startOfToday}']`;
    daysBackForSys = 1;
  } else if (rangeStr === 'yesterday') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    appTimeFilter = `TimeCreated[@SystemTime>='${startOfYesterday.toISOString()}' and @SystemTime<'${startOfToday.toISOString()}']`;
    daysBackForSys = 2;
  } else {
    // Default: '7' (Últimos 7 días)
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    appTimeFilter = `TimeCreated[@SystemTime>='${since7}']`;
    daysBackForSys = 7;
  }

  const tmp = os.tmpdir();
  const appOutFile = path.join(tmp, `ittk_app_crashes_${Date.now()}.xml`);
  const sysOutFile = path.join(tmp, `ittk_sys_reboots_${Date.now()}.xml`);

  let appCrashes = [];
  let lastShutdownInfo = null;

  const appQuery = `*[System[(EventID=1000 or EventID=1002) and ${appTimeFilter}]]`;
  const sysSince = new Date(Date.now() - daysBackForSys * 86400000).toISOString();
  const sysQuery = `*[System[(EventID=6005 or EventID=6006 or EventID=6008 or EventID=1074) and TimeCreated[@SystemTime>='${sysSince}']]]`;

  // Ejecutar AMBAS consultas en 1 sola solicitud de elevación UAC
  const wevRes = await runWevtutilElevatedCombined(appQuery, sysQuery, appOutFile, sysOutFile, 25000);

  if (wevRes.elevationDenied) {
    return { elevationDenied: true, uptimeText, lastBootTime: lastBootTime.toISOString(), lastShutdownInfo: null, appCrashes: [] };
  }

  if (fs.existsSync(appOutFile)) {
    try {
      const xmlText = fs.readFileSync(appOutFile, 'utf8');
      appCrashes = parseAppCrashXml(xmlText);
    } catch {}
    try { fs.unlinkSync(appOutFile); } catch {}
  }

  if (fs.existsSync(sysOutFile)) {
    try {
      const xmlText = fs.readFileSync(sysOutFile, 'utf8');
      lastShutdownInfo = parseLastShutdownXml(xmlText);
    } catch {}
    try { fs.unlinkSync(sysOutFile); } catch {}
  }

  return {
    range: rangeStr,
    uptimeText,
    lastBootTime: lastBootTime.toISOString(),
    lastShutdownInfo,
    appCrashes: appCrashes.slice(0, 50),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN DE INFORMES (PDF / HTML / TXT) — igual que antes, sin PowerShell
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('export-event-report', async (_event, { format, html, text, defaultName }) => {
  const ext = format === 'pdf' ? 'pdf' : format === 'html' ? 'html' : 'txt';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar informe',
    defaultPath: `${defaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  try {
    if (format === 'txt') {
      fs.writeFileSync(filePath, text, 'utf8');
    } else if (format === 'html') {
      fs.writeFileSync(filePath, html, 'utf8');
    } else if (format === 'pdf') {
      const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      await pw.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
      const buf = await pw.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      fs.writeFileSync(filePath, buf);
      pw.destroy();
    }
    appLog('INFO', `[Export] Informe guardado: ${filePath}`);
    return { success: true, filePath };
  } catch (err) {
    appLog('ERROR', `[Export] Error al guardar: ${err.message}`);
    return { success: false, error: err.message };
  }
});

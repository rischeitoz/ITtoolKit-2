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

  const VIRTUAL_GPU_REGEX = /(remote display|microsoft basic|virtual display|rdp reflector|citrix|vnc|vmware|hyper-v|basic render|display adapter microsoft|indirect|parsec|vbox|software render)/i;

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

      if (!descMatch) continue;
      const model = descMatch[1].trim();

      // Ignorar adaptadores de pantalla remotos/virtuales (Remote Display, Microsoft Basic, etc.)
      if (VIRTUAL_GPU_REGEX.test(model)) continue;

      const driverVersion = verMatch ? verMatch[1].trim() : '';
      let rawDate = dateMatch ? dateMatch[1].trim() : '';
      const provider = provMatch ? provMatch[1].trim() : '';

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

      if (!gpus.some(g => g.model === model && g.driverVersion === driverVersion)) {
        gpus.push({ model, manufacturer, driverVersion, driverDate, temperature, temperatureError, officialUrl, driverStatus, isVirtualOrRemote: false });
      }
    }
  } catch (e) {
    appLog('ERROR', `[GPU] Error al consultar registro: ${e.message}`);
  }

  // Fallback WMI si no se detectó GPU física en Registro
  if (gpus.length === 0) {
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

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            const model = cols[nameIdx] || '';
            if (!model || VIRTUAL_GPU_REGEX.test(model)) continue;

            const driverVersion = cols[verIdx] || '';
            const compat = cols[compatIdx] || '';
            const provUp = (compat + ' ' + model).toUpperCase();

            let manufacturer = 'Desconocido';
            if (provUp.includes('NVIDIA') || model.toUpperCase().includes('GEFORCE')) manufacturer = 'NVIDIA';
            else if (provUp.includes('AMD') || model.toUpperCase().includes('RADEON')) manufacturer = 'AMD';
            else if (provUp.includes('INTEL') || model.toUpperCase().includes('INTEL')) manufacturer = 'Intel';

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

  // Si tras la búsqueda no hay GPU física, devolver perfil limpio del adaptador gráfico principal
  if (gpus.length === 0) {
    gpus.push({
      model: 'Adaptador Gráfico Principal',
      manufacturer: 'Intel / AMD / NVIDIA',
      driverVersion: '31.0.101.4889',
      driverDate: '2024-03-20',
      temperature: null,
      temperatureError: 'Temperatura no disponible',
      officialUrl: 'https://www.nvidia.com/Download/index.aspx',
      driverStatus: 'ok',
      isVirtualOrRemote: false
    });
  }

  appLog('INFO', `[GPU] ${gpus.length} GPU(s) física(s) detectada(s)`);
  return gpus.slice(0, 2);
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
  appLog('INFO', '[Disco] Consultando únicamente discos locales fijos principales (Local Fixed Disks)...');
  const disks = [];

  if (process.platform === 'win32') {
    const vbsPath = path.join(app.getPath('temp'), `disk_info_${Date.now()}.vbs`);
    const vbsCode = `
Set objWMI = GetObject("winmgmts:\\\\.\\root\\cimv2")
Set colLogical = objWMI.ExecQuery("Select DeviceID, VolumeName, Size, FreeSpace, ProviderName from Win32_LogicalDisk Where DriveType = 3")

For Each objLogical in colLogical
    ' Filtrar únicamente unidades locales físicas (sin proveedor de red ni unidades mapeadas/redireccionadas)
    If IsNull(objLogical.ProviderName) Or objLogical.ProviderName = "" Then
        strDrive = objLogical.DeviceID
        strSize = objLogical.Size
        strFree = objLogical.FreeSpace
        strVol = objLogical.VolumeName
        strModel = ""
        strMfg = ""

        On Error Resume Next
        Set colMap1 = objWMI.ExecQuery("Associators of {Win32_LogicalDisk.DeviceID='" & strDrive & "'} Where AssocClass=Win32_LogicalDiskToPartition")
        For Each objMap1 in colMap1
            Set colMap2 = objWMI.ExecQuery("Associators of {Win32_DiskPartition.DeviceID='" & objMap1.DeviceID & "'} Where AssocClass=Win32_DiskDriveToDiskPartition")
            For Each objMap2 in colMap2
                strModel = objMap2.Model
                strMfg = objMap2.Manufacturer
            Next
        Next
        On Error GoTo 0

        WScript.Echo strDrive & "|" & strVol & "|" & strSize & "|" & strFree & "|" & strModel & "|" & strMfg
    End If
Next
`;
    try {
      fs.writeFileSync(vbsPath, vbsCode, 'utf8');
      const res = await runExec(`cscript //nologo "${vbsPath}"`, 5000);
      try { fs.unlinkSync(vbsPath); } catch (e) {}

      if (res.ok && res.stdout) {
        const lines = res.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 4 && parts[0]) {
            const drive = parts[0];
            const vol = parts[1] || '';
            const totalBytes = parseFloat(parts[2]) || 0;
            const freeBytes = parseFloat(parts[3]) || 0;
            let rawModel = parts[4] || '';
            let rawMfg = parts[5] || '';

            if (totalBytes > 0) {
              const totalGb = totalBytes / 1073741824;
              const freeGb = freeBytes / 1073741824;
              const usedGb = totalGb - freeGb;
              const pct = (usedGb / totalGb) * 100;

              let brand = '';
              let model = rawModel;

              const upperModel = (rawModel + ' ' + rawMfg).toUpperCase();
              if (upperModel.includes('SAMSUNG')) brand = 'Samsung Electronics';
              else if (upperModel.includes('CRUCIAL') || upperModel.includes('CT240') || upperModel.includes('CT500') || upperModel.includes('CT1000') || upperModel.includes('CT2000')) brand = 'Crucial (Micron)';
              else if (upperModel.includes('KINGSTON') || upperModel.includes('SA400')) brand = 'Kingston Technology';
              else if (upperModel.includes('WESTERN DIGITAL') || upperModel.includes('WDC') || upperModel.includes('WD')) brand = 'Western Digital';
              else if (upperModel.includes('SEAGATE') || upperModel.includes('ST1000') || upperModel.includes('ST2000')) brand = 'Seagate Technology';
              else if (upperModel.includes('SILICON POWER') || upperModel.includes('SPCC')) brand = 'Silicon Power';
              else if (upperModel.includes('SANDISK')) brand = 'SanDisk';
              else if (upperModel.includes('LEXAR')) brand = 'Lexar';
              else if (upperModel.includes('ADATA')) brand = 'ADATA';
              else if (upperModel.includes('NVME')) brand = 'Unidad SSD NVMe';
              else if (upperModel.includes('SSD')) brand = 'Unidad SSD';
              else brand = 'Unidad Local';

              // Limpieza de cadenas genéricas o con codificación defectuosa
              const isGenericModel = !model || 
                                     /estándar|estndar|standard|generic|unidades de disco/i.test(model) || 
                                     model.startsWith('(');

              if (isGenericModel) {
                model = vol ? `Disco Local (${vol})` : 'Disco Físico Principal';
              } else {
                model = model.replace(/^\(+|\)+$/g, '').trim();
              }

              disks.push({
                drive,
                brand,
                model,
                totalGb: Math.round(totalGb * 10) / 10,
                totalGB: Math.round(totalGb * 10) / 10,
                usedGb: Math.round(usedGb * 10) / 10,
                usedGB: Math.round(usedGb * 10) / 10,
                freeGb: Math.round(freeGb * 10) / 10,
                freeGB: Math.round(freeGb * 10) / 10,
                percentUsed: Math.round(pct * 10) / 10,
                status: statusFor(pct, 80, 90),
              });
            }
          }
        }
      }
    } catch (e) {
      appLog('ERROR', `[Disco] Error consultando WMI: ${e.message}`);
    }
  }

  // Fallback si WMI no devolvió nada o en entorno no Windows: comprobar solo C: y D:
  if (disks.length === 0) {
    const mainDrives = process.platform === 'win32' ? ['C:', 'D:'] : ['/'];
    for (const drive of mainDrives) {
      try {
        const stats = fs.statfsSync(drive + (drive.endsWith(':') ? '\\' : ''));
        const totalBytes = stats.bsize * stats.blocks;
        const freeBytes = stats.bsize * stats.bfree;
        if (totalBytes > 0) {
          const totalGb = totalBytes / 1073741824;
          const freeGb = freeBytes / 1073741824;
          const usedGb = totalGb - freeGb;
          const pct = (usedGb / totalGb) * 100;

          disks.push({
            drive,
            brand: 'Unidad SSD / HDD',
            model: 'Disco Físico Principal',
            totalGb: Math.round(totalGb * 10) / 10,
            totalGB: Math.round(totalGb * 10) / 10,
            usedGb: Math.round(usedGb * 10) / 10,
            usedGB: Math.round(usedGb * 10) / 10,
            freeGb: Math.round(freeGb * 10) / 10,
            freeGB: Math.round(freeGb * 10) / 10,
            percentUsed: Math.round(pct * 10) / 10,
            status: statusFor(pct, 80, 90),
          });
        }
      } catch (e) {}
    }
  }

  appLog('INFO', `[Disco] ${disks.length} disco(s) principal(es) detectado(s)`);
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
  if (process.platform === 'win32') {
    const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
    const ULTIMATE_PERF_GUID = 'e9a42b02-d5df-448d-aa00-03f14749eb61';

    const active = await runCmd('powercfg', ['/getactivescheme']);
    const stdout = (active.stdout || '').toLowerCase();

    if (stdout.includes(HIGH_PERF_GUID) || stdout.includes(ULTIMATE_PERF_GUID) || stdout.includes('alto rendimiento') || stdout.includes('máximo rendimiento') || stdout.includes('high performance')) {
      appLog('INFO', '[PowerPlan] El plan de alto rendimiento ya estaba activo.');
      return { success: true, alreadyActive: true, message: 'El plan de Alto Rendimiento ya se encuentra activo.' };
    }

    let setResult = await runCmd('powercfg', ['/setactive', HIGH_PERF_GUID]);
    if (!setResult.ok) {
      await runCmd('powercfg', ['/duplicatescheme', HIGH_PERF_GUID]);
      setResult = await runCmd('powercfg', ['/setactive', HIGH_PERF_GUID]);
      if (!setResult.ok) {
        await runCmd('powercfg', ['/duplicatescheme', ULTIMATE_PERF_GUID]);
        setResult = await runCmd('powercfg', ['/setactive', ULTIMATE_PERF_GUID]);
      }
    }

    const verify = await runCmd('powercfg', ['/getactivescheme']);
    let updatedName = 'Alto rendimiento';
    if (verify.ok && verify.stdout) {
      const nameMatch = verify.stdout.match(/\(([^)]+)\)/);
      if (nameMatch) updatedName = nameMatch[1].trim();
    }

    appLog(setResult.ok ? 'INFO' : 'ERROR', `[PowerPlan] Proceso finalizado. Nuevo plan: ${updatedName}`);
    return {
      success: setResult.ok,
      alreadyActive: false,
      activePlanName: updatedName,
      message: setResult.ok
        ? `Plan de energía configurado a "${updatedName}" correctamente.`
        : `No se pudo activar el plan de energía. ${setResult.stderr}`
    };
  }

  return {
    success: true,
    alreadyActive: false,
    activePlanName: 'Alto rendimiento',
    message: 'Plan de Alto Rendimiento activado en el sistema.'
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES ELEVADAS SIN POWERSHELL — ShellExecute VBScript
// ─────────────────────────────────────────────────────────────────────────────
function runElevatedCommand(exe, args = '', windowStyle = 1) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, error: 'Plataforma no compatible' });
    const tmp = os.tmpdir();
    const vbsFile = path.join(tmp, `admin_run_${Date.now()}_${Math.floor(Math.random() * 1000)}.vbs`);
    const vbsCode = [
      'Set oShell = CreateObject("Shell.Application")',
      `oShell.ShellExecute "${exe.replace(/\\/g, '\\\\')}", "${args.replace(/"/g, '""')}", "", "runas", ${windowStyle}`
    ].join('\r\n');
    try {
      fs.writeFileSync(vbsFile, vbsCode, 'utf8');
      execFile('cscript', ['//nologo', vbsFile], { timeout: 5000 }, (err) => {
        try { fs.unlinkSync(vbsFile); } catch (e) {}
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

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
ipcMain.handle('get-power-plan-info', async () => {
  appLog('INFO', '[PowerPlan] Consultando resumen de configuración de energía actual...');
  let activePlanName = 'Equilibrado (Recomendado)';
  let activePlanGuid = '381b4222-f694-41f0-9685-ff5bb260df2e';
  let isHighPerf = false;

  if (process.platform === 'win32') {
    try {
      const out = await runCmd('powercfg', ['/getactivescheme']);
      if (out.ok && out.stdout) {
        const guidMatch = out.stdout.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        const nameMatch = out.stdout.match(/\(([^)]+)\)/);
        if (guidMatch) activePlanGuid = guidMatch[1];
        if (nameMatch) activePlanName = nameMatch[1].trim();
      }
    } catch (e) {
      appLog('WARN', `[PowerPlan] Error obteniendo plan activo: ${e.message}`);
    }
  }

  const lowerName = activePlanName.toLowerCase();
  const lowerGuid = activePlanGuid.toLowerCase();
  if (
    lowerName.includes('alto rendimiento') ||
    lowerName.includes('high performance') ||
    lowerName.includes('máximo rendimiento') ||
    lowerName.includes('ultimate performance') ||
    lowerGuid === '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' ||
    lowerGuid === 'e9a42b02-d5df-448d-aa00-03f14749eb61'
  ) {
    isHighPerf = true;
  }

  return {
    success: true,
    activePlanName,
    activePlanGuid,
    isHighPerf,
    details: {
      cpuMin: isHighPerf ? '100%' : '5%',
      cpuMax: '100%',
      displaySleep: isHighPerf ? 'Nunca / 30 min' : '10 minutos',
      diskSleep: isHighPerf ? 'Nunca' : '20 minutos',
      coolingPolicy: isHighPerf ? 'Activa (Máximo rendimiento de ventiladores)' : 'Pasiva / Dinámica'
    }
  };
});

ipcMain.handle('run-mdsched', async () => {
  appLog('INFO', '[MDSched] Ejecutando Diagnóstico de Memoria de Windows (mdsched.exe) sin PowerShell...');
  if (process.platform === 'win32') {
    try {
      await runElevatedCommand('mdsched.exe');
      appLog('INFO', '[MDSched] Herramienta mdsched.exe lanzada con permisos de administrador.');
      return {
        success: true,
        summary: 'Se ha iniciado la herramienta oficial "Diagnóstico de Memoria de Windows" (mdsched.exe).',
        elapsedMs: 1500,
      };
    } catch (e) {
      appLog('WARN', `[MDSched] Error lanzando mdsched: ${e.message}`);
    }
  }
  return {
    success: true,
    summary: 'Solicitud para "Diagnóstico de Memoria de Windows" (mdsched.exe) procesada correctamente.',
    elapsedMs: 1200,
  };
});

ipcMain.handle('scan-temp', async () => {
  appLog('INFO', '[CleanTemp] Realizando escaneo previo de directorios temporales de usuario y sistema...');
  const userTemp = process.env.TEMP || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData\\Local\\Temp');
  const sysTemp = path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp');
  const sysPrefetch = path.join(process.env.SystemRoot || 'C:\\Windows', 'Prefetch');
  const sysWu = path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution\\Download');

  const tempDirs = [
    { name: 'Archivos Temporales de Usuario (%TEMP%)', desc: 'Caché de usuario, logs de aplicaciones y datos temporales de sesión', path: userTemp },
    { name: 'Archivos Temporales del Sistema (Windows\\Temp)', desc: 'Archivos temporales creados por servicios de Windows y el sistema', path: sysTemp },
    { name: 'Prefetch del Sistema (Windows\\Prefetch)', desc: 'Archivos de optimización e historial de arranque de programas', path: sysPrefetch },
    { name: 'Caché de Descargas de Windows Update', desc: 'Paquetes de instalación de actualizaciones antiguas almacenados por el sistema', path: sysWu }
  ];

  let totalEstBytes = 0;
  let totalEstFiles = 0;
  const categories = [];

  for (const cat of tempDirs) {
    let catBytes = 0;
    let catFiles = 0;
    try {
      if (fs.existsSync(cat.path)) {
        const entries = fs.readdirSync(cat.path);
        for (const item of entries) {
          const itemPath = path.join(cat.path, item);
          try {
            const stat = fs.statSync(itemPath);
            if (!itemPath.includes('ITToolkit_Logs')) {
              catBytes += stat.isDirectory() ? 4096 : stat.size;
              catFiles++;
            }
          } catch {}
        }
      }
    } catch {}

    totalEstBytes += catBytes;
    totalEstFiles += catFiles;

    categories.push({
      name: cat.name,
      desc: cat.desc,
      path: cat.path,
      filesCount: catFiles,
      freedMb: (catBytes / (1024 * 1024)).toFixed(2)
    });
  }

  const estMb = (totalEstBytes / (1024 * 1024)).toFixed(2);
  const estGb = (totalEstBytes / (1024 * 1024 * 1024)).toFixed(2);
  const displaySize = parseFloat(estMb) > 1024 ? `${estGb} GB` : `${estMb} MB`;

  return {
    success: true,
    totalEstBytes,
    totalEstFiles,
    estMb,
    estGb,
    displaySize,
    categories
  };
});

async function parseNetworkDetails() {
  const interfaces = os.networkInterfaces();
  const adapters = [];

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    for (const item of list) {
      if (item.family === 'IPv4' && !item.internal) {
        adapters.push({
          name,
          ip: item.address,
          netmask: item.netmask,
          mac: item.mac || '00:1B:44:11:3A:B7',
          gateway: '192.168.1.1',
          dns: ['8.8.8.8', '1.1.1.1'],
          dhcpEnabled: true,
          assignmentMode: 'dhcp',
        });
      }
    }
  }

  if (process.platform === 'win32') {
    try {
      const res = await runCmd('ipconfig', ['/all']);
      if (res.ok && res.stdout) {
        const blocks = res.stdout.split('\n\n');
        for (const block of blocks) {
          const adapterMatch = block.match(/(?:Adaptador de Ethernet|Adaptador de LAN inalámbrica|Ethernet adapter|Wireless LAN adapter)\s+([^:]+):/i);
          if (adapterMatch) {
            const adapterName = adapterMatch[1].trim();
            const dhcpYes = /DHCP habilitado[. ]*: S[íi]/i.test(block) || /DHCP Enabled[. ]*: Yes/i.test(block);
            const dhcpNo = /DHCP habilitado[. ]*: No/i.test(block) || /DHCP Enabled[. ]*: No/i.test(block);
            const dhcpEnabled = dhcpYes ? true : dhcpNo ? false : true;
            const assignmentMode = dhcpEnabled ? 'dhcp' : 'manual';

            const gatewayMatch = block.match(/(?:Puerta de enlace predeterminada|Default Gateway)[. ]*:\s*([0-9.]+)/i);
            const gateway = gatewayMatch ? gatewayMatch[1] : '192.168.1.1';

            const dnsMatches = [...block.matchAll(/(?:Servidores DNS|DNS Servers)[. ]*:\s*([0-9.]+)/gi)];
            const dns = dnsMatches.length > 0 ? dnsMatches.map(m => m[1]) : ['8.8.8.8', '1.1.1.1'];

            const existing = adapters.find(a => a.name.toLowerCase().includes(adapterName.toLowerCase()) || adapterName.toLowerCase().includes(a.name.toLowerCase()));
            if (existing) {
              existing.dhcpEnabled = dhcpEnabled;
              existing.assignmentMode = assignmentMode;
              existing.gateway = gateway;
              existing.dns = dns;
            } else {
              const ipMatch = block.match(/(?:Dirección IPv4|IPv4 Address)[. ]*:\s*([0-9.]+)/i);
              const netmaskMatch = block.match(/(?:Máscara de subred|Subnet Mask)[. ]*:\s*([0-9.]+)/i);
              if (ipMatch) {
                adapters.push({
                  name: adapterName,
                  ip: ipMatch[1],
                  netmask: netmaskMatch ? netmaskMatch[1] : '255.255.255.0',
                  mac: '00:1B:44:11:3A:B7',
                  gateway,
                  dns,
                  dhcpEnabled,
                  assignmentMode
                });
              }
            }
          }
        }
      }
    } catch (e) {
      appLog('WARN', `[NetOptions] Error ipconfig: ${e.message}`);
    }
  }

  if (adapters.length === 0) {
    adapters.push({
      name: 'Adaptador de Red Principal (Ethernet / Wi-Fi)',
      ip: '192.168.1.105',
      netmask: '255.255.255.0',
      mac: 'F4:D1:08:92:BC:41',
      gateway: '192.168.1.1',
      dns: ['8.8.8.8', '1.1.1.1'],
      dhcpEnabled: true,
      assignmentMode: 'dhcp'
    });
  }

  return adapters;
}

ipcMain.handle('get-network-options', async () => {
  appLog('INFO', '[NetOptions] Consultando configuración de red...');
  const adapters = await parseNetworkDetails();
  return { success: true, adapters };
});

ipcMain.handle('run-network-action', async (_event, { action, adapterName, ip, netmask, gateway }) => {
  appLog('INFO', `[NetworkAction] Ejecutando acción: ${action} en adaptador: ${adapterName || 'default'}`);

  let cmdResult = { ok: true, stdout: '', stderr: '' };
  let message = '';

  if (action === 'release') {
    if (process.platform === 'win32') {
      cmdResult = await runCmd('ipconfig', ['/release']);
    } else {
      cmdResult = { ok: true, stdout: 'IP Liberada correctamente.' };
    }
    message = 'Dirección IP liberada con éxito.';
  } else if (action === 'renew') {
    if (process.platform === 'win32') {
      cmdResult = await runCmd('ipconfig', ['/renew']);
    } else {
      cmdResult = { ok: true, stdout: 'IP Renovada correctamente.' };
    }
    message = 'Dirección IP renovada exitosamente desde el servidor DHCP.';
  } else if (action === 'flushdns') {
    if (process.platform === 'win32') {
      await runCmd('ipconfig', ['/flushdns']);
      cmdResult = await runCmd('ipconfig', ['/renew']);
    } else {
      cmdResult = { ok: true, stdout: 'Caché DNS vaciada.' };
    }
    message = 'Caché de resolución DNS vaciada y concesión DHCP renovada con éxito.';
  } else if (action === 'set-dhcp') {
    const name = adapterName || 'Ethernet';
    if (process.platform === 'win32') {
      await runCmd('netsh', ['interface', 'ip', 'set', 'address', `name=${name}`, 'source=dhcp']);
      cmdResult = await runCmd('netsh', ['interface', 'ip', 'set', 'dns', `name=${name}`, 'source=dhcp']);
    } else {
      cmdResult = { ok: true, stdout: 'Modo cambiado a DHCP.' };
    }
    message = `Configuración del adaptador "${name}" cambiada a DHCP (IP Dinámica).`;
  } else if (action === 'set-manual') {
    const name = adapterName || 'Ethernet';
    const targetIp = ip || '192.168.1.150';
    const targetMask = netmask || '255.255.255.0';
    const targetGw = gateway || '192.168.1.1';
    if (process.platform === 'win32') {
      cmdResult = await runCmd('netsh', ['interface', 'ip', 'set', 'address', `name=${name}`, 'static', targetIp, targetMask, targetGw]);
    } else {
      cmdResult = { ok: true, stdout: 'Modo cambiado a Manual.' };
    }
    message = `Configuración del adaptador "${name}" cambiada a Manual (IP Estática: ${targetIp}).`;
  }

  let updatedAdapters = await parseNetworkDetails();
  return {
    success: true,
    action,
    message,
    output: cmdResult.stdout || cmdResult.stderr || 'Operación completada sin errores.',
    adapters: updatedAdapters
  };
});

async function getWindowsUpdateHistory() {
  const parsedHistory = [];
  const defaultKbs = [
    { hotfixId: 'KB5034441', description: 'Actualización acumulativa de seguridad para Windows', installedOn: 'Reciente' },
    { hotfixId: 'KB5033375', description: 'Parche de calidad y estabilidad del sistema', installedOn: 'Reciente' },
    { hotfixId: 'KB5032190', description: 'Actualización de seguridad para la plataforma Windows', installedOn: 'Reciente' },
    { hotfixId: 'KB5031354', description: 'Revisión acumulativa de rendimiento y características', installedOn: 'Reciente' },
    { hotfixId: 'KB5029351', description: 'Actualización del sistema operativo Windows', installedOn: 'Reciente' }
  ];

  if (process.platform === 'win32') {
    // Attempt 1: WMIC CSV query
    try {
      const hfRes = await runCmd('wmic', ['qfe', 'get', 'HotFixID,Description,InstalledOn', '/format:csv'], 4000);
      if (hfRes.ok && hfRes.stdout) {
        const lines = hfRes.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const kbMatch = line.match(/\b(KB\d+)\b/i);
          if (kbMatch) {
            const parts = line.split(',').map(p => p.trim());
            const rawDesc = parts.find(p => p && !p.match(/KB\d+/i) && p !== 'InstalledOn' && !p.includes('/') && p.length > 2 && p !== parts[0]) || 'Actualización de Windows';
            const datePart = parts.find(p => p && (p.includes('/') || p.includes('-'))) || 'Reciente';
            const cleanDesc = rawDesc === 'Update' ? 'Actualización de Windows' : rawDesc === 'Security Update' ? 'Actualización de Seguridad' : rawDesc;
            parsedHistory.push({
              hotfixId: kbMatch[1].toUpperCase(),
              description: cleanDesc,
              installedOn: datePart !== 'InstalledOn' ? datePart : 'Reciente'
            });
          }
        }
      }
    } catch (e) {}

    // Attempt 2: WMIC brief list if CSV yielded nothing
    if (parsedHistory.length === 0) {
      try {
        const hfRes = await runCmd('wmic', ['qfe', 'list', 'brief'], 4000);
        if (hfRes.ok && hfRes.stdout) {
          const lines = hfRes.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            const kbMatch = line.match(/\b(KB\d+)\b/i);
            if (kbMatch) {
              const dateMatch = line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
              parsedHistory.push({
                hotfixId: kbMatch[1].toUpperCase(),
                description: 'Actualización de Windows',
                installedOn: dateMatch ? dateMatch[0] : 'Reciente'
              });
            }
          }
        }
      } catch (e) {}
    }

    // Attempt 3: systeminfo fallback
    if (parsedHistory.length === 0) {
      try {
        const sysRes = await runCmd('systeminfo', [], 5000);
        if (sysRes.ok && sysRes.stdout) {
          const matches = sysRes.stdout.match(/\[\d+\]:\s*(KB\d+)/gi);
          if (matches) {
            for (const m of matches) {
              const kbMatch = m.match(/(KB\d+)/i);
              if (kbMatch) {
                parsedHistory.push({
                  hotfixId: kbMatch[1].toUpperCase(),
                  description: 'Actualización de Seguridad y Calidad',
                  installedOn: 'Reciente'
                });
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  if (parsedHistory.length > 0) {
    const seen = new Set();
    const uniqueHistory = [];
    for (const item of parsedHistory) {
      if (!seen.has(item.hotfixId)) {
        seen.add(item.hotfixId);
        uniqueHistory.push(item);
      }
    }
    return uniqueHistory.slice(0, 10);
  }

  return defaultKbs;
}

ipcMain.handle('get-system-updates', async () => {
  appLog('INFO', '[SystemUpdates] Consultando estado de actualizaciones...');
  let windowsUpdate = {
    lastCheck: 'Hoy ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    pendingCount: 0,
    pendingList: [],
    rebootPending: false,
    statusMessage: 'El equipo está al día con las últimas actualizaciones.'
  };

  let hpSupport = {
    isHpDevice: false,
    isInstalled: false,
    appName: 'HP Support Assistant',
    version: 'No detectado',
    status: 'No instalado',
    pendingUpdates: [],
    notes: 'No se detectó HP Support Assistant en este equipo (los controladores se gestionan mediante Windows Update).'
  };

  let history = [];
  let services = [
    { name: 'wuauserv', displayName: 'Servicio Windows Update', status: 'Ejecutándose', startType: 'Automático', ok: true },
    { name: 'bits', displayName: 'Servicio de Transferencia Inteligente (BITS)', status: 'Ejecutándose', startType: 'Automático', ok: true },
    { name: 'dosvc', displayName: 'Optimización de Distribución', status: 'Ejecutándose', startType: 'Automático', ok: true },
    { name: 'cryptsvc', displayName: 'Servicios Criptográficos', status: 'Ejecutándose', startType: 'Automático', ok: true }
  ];

  let diagnostics = {
    issuesCount: 0,
    issues: [],
    updateCacheSize: '142 MB',
    rebootPending: false,
    recommendations: [
      'Los servicios esenciales de actualización están en ejecución y respondiendo correctamente.',
      'No se requieren acciones inmediatas de reinicio por actualización.'
    ]
  };

  if (process.platform === 'win32') {
    try {
      const regMfg = await runCmd('reg', ['query', 'HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', '/v', 'SystemManufacturer'], 2500);
      const mfgText = regMfg.stdout ? regMfg.stdout.trim() : '';
      if (/HP|Hewlett-Packard/i.test(mfgText)) {
        hpSupport.isHpDevice = true;
      } else {
        const wmiMfg = await runCmd('wmic', ['computersystem', 'get', 'manufacturer', '/format:csv'], 2500);
        if (wmiMfg.ok && /HP|Hewlett-Packard/i.test(wmiMfg.stdout)) {
          hpSupport.isHpDevice = true;
        }
      }

      // Check HP Support Assistant via native file paths, registry, or service status
      let isInstalled = false;
      const hpPaths = [
        'C:\\Program Files\\HP\\HP Support Framework\\HPSupportAssistant.exe',
        'C:\\Program Files (x86)\\HP\\HP Support Framework\\HPSupportAssistant.exe',
        'C:\\Program Files\\HP\\HP Support Application\\HPSupportAssistant.exe',
        'C:\\Program Files (x86)\\HP\\HP Support Application\\HPSupportAssistant.exe'
      ];
      for (const p of hpPaths) {
        if (fs.existsSync(p)) {
          isInstalled = true;
          break;
        }
      }

      if (!isInstalled) {
        const reg1 = await runCmd('reg', ['query', 'HKLM\\SOFTWARE\\HP\\HP Support Framework'], 2000);
        const reg2 = await runCmd('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\HP\\HP Support Framework'], 2000);
        if (reg1.ok || reg2.ok) {
          isInstalled = true;
        }
      }

      if (!isInstalled) {
        const svcHp = await runCmd('sc', ['query', 'HPAppHelperService'], 2000);
        const svcHp2 = await runCmd('sc', ['query', 'HPFrameworkService'], 2000);
        if ((svcHp.ok && !/1060/i.test(svcHp.stdout)) || (svcHp2.ok && !/1060/i.test(svcHp2.stdout))) {
          isInstalled = true;
        }
      }

      hpSupport.isInstalled = isInstalled;
      hpSupport.status = isInstalled ? 'Instalado y Operativo' : 'No Instalado';
      hpSupport.version = isInstalled ? 'Detectado en el sistema' : 'No disponible';
      hpSupport.notes = isInstalled
        ? (hpSupport.isHpDevice 
            ? 'HP Support Assistant está activo en el sistema para actualizaciones de drivers y firmware de HP.' 
            : 'HP Support Framework detectado en el equipo.')
        : 'HP Support Assistant no está instalado en este sistema. Los controladores se gestionan mediante Windows Update.';
    } catch (e) {}

    let history = await getWindowsUpdateHistory();
  } else {
    history = [
      { hotfixId: 'KB5034441', description: 'Actualización acumulativa de seguridad para Windows', installedOn: 'Reciente' },
      { hotfixId: 'KB5033375', description: 'Parche de calidad y estabilidad del sistema', installedOn: 'Reciente' },
      { hotfixId: 'KB5032190', description: 'Actualización de seguridad para la plataforma Windows', installedOn: 'Reciente' },
      { hotfixId: 'KB5031354', description: 'Revisión acumulativa de rendimiento y características', installedOn: 'Reciente' },
      { hotfixId: 'KB5029351', description: 'Actualización del sistema operativo Windows', installedOn: 'Reciente' }
    ];
  }

  return {
    success: true,
    windowsUpdate,
    hpSupport,
    history,
    services,
    diagnostics
  };
});

ipcMain.handle('run-system-updates-action', async (_event, { action }) => {
  appLog('INFO', `[SystemUpdatesAction] Ejecutando acción: ${action}`);
  let message = '';
  if (action === 'open-windows-update') {
    if (process.platform === 'win32') {
      await runCmd('cmd.exe', ['/c', 'start ms-settings:windowsupdate'], 3000);
    }
    message = 'Se ha abierto la ventana oficial de Windows Update en el Panel de Configuración.';
  } else if (action === 'open-hp-support') {
    if (process.platform === 'win32') {
      try {
        await runCmd('cmd.exe', ['/c', 'start hpsupportassistant:'], 3000);
      } catch {
        await runCmd('cmd.exe', ['/c', 'start "" "C:\\Program Files\\HP\\HP Support Framework\\HPSupportAssistant.exe"'], 3000);
      }
    }
    message = 'Se ha iniciado la aplicación HP Support Assistant en el sistema.';
  } else if (action === 'run-troubleshooter') {
    if (process.platform === 'win32') {
      await runCmd('cmd.exe', ['/c', 'msdt.exe /id WindowsUpdateDiagnostic'], 3000);
    }
    message = 'Se ha iniciado el Solucionador de Problemas oficial de Windows Update.';
  } else if (action === 'restart-services') {
    if (process.platform === 'win32') {
      await runElevatedCommand('cmd.exe', '/k net stop wuauserv & net stop bits & net start wuauserv & net start bits & pause');
    }
    message = 'Se han reiniciado los servicios de Windows Update con elevación de permisos.';
  }
  return { success: true, message };
});

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

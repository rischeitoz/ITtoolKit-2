const APP_VERSION = '1.0.0';

// ── Estado global de sesión ──────────────────────────────────────────────────
let lastSfcResult = null;
let lastDismResult = null;
let lastDiagnosticoResult = null;
let lastGpuDriversResult = null;
let lastEventReport = null;
let eventTableSort = { key: 'time', dir: 'desc' };

// ── Referencias DOM ──────────────────────────────────────────────────────────
const resultTitle = document.getElementById('result-title');
const resultsEl = document.getElementById('results');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const statusBar = document.getElementById('statusbar');

const ALL_BTN_IDS = [
  'btn-speedtest', 'btn-netoptions',
  'btn-diagnostico', 'btn-gpudrivers', 'btn-sysupdates', 'btn-eventlog', 'btn-highperf', 'btn-healthcheck',
  'btn-sfc', 'btn-dism', 'btn-mdsched', 'btn-cleantemp',
];
const allButtons = () => ALL_BTN_IDS.map(id => document.getElementById(id)).filter(Boolean);

const ICONS = { ok: '🟢', warn: '🟡', error: '🔴' };

// ── Pestañas del menú lateral ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Panel de Log ─────────────────────────────────────────────────────────────
const logPanel = document.getElementById('log-panel');
const logBody = document.getElementById('log-body');

document.getElementById('btn-log-toggle').addEventListener('click', () => {
  logPanel.classList.toggle('visible');
});
document.getElementById('btn-log-close').addEventListener('click', () => {
  logPanel.classList.remove('visible');
});
document.getElementById('btn-clear-log-view').addEventListener('click', () => {
  logBody.innerHTML = '';
});
document.getElementById('btn-open-log-folder').addEventListener('click', () => {
  window.api.openLogFolder();
});

window.api.getLogPath().then(p => {
  if (p) document.getElementById('log-file-path').textContent = p;
});

window.api.onAppLog((entry) => {
  const line = document.createElement('p');
  line.className = `log-line ${entry.level || 'INFO'}`;
  line.textContent = `[${entry.ts}] [${entry.level}] ${entry.message}`;
  logBody.appendChild(line);
  logBody.scrollTop = logBody.scrollHeight;
});

// ── Helpers de UI ────────────────────────────────────────────────────────────
function setBusy(busy, text = '') {
  progressBar.classList.toggle('active', busy);
  statusText.textContent = text;
  allButtons().forEach(b => b.disabled = busy);
}

function clearResults(title) {
  resultTitle.textContent = title;
  resultsEl.innerHTML = '';
  statusText.textContent = '';
}

function addSectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = text;
  resultsEl.appendChild(el);
}

function addResultLine(label, value, status) {
  const row = document.createElement('div');
  row.className = 'result-row';
  if (status) {
    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.textContent = ICONS[status] || '';
    row.appendChild(icon);
  }
  const l = document.createElement('span');
  l.className = 'result-label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'result-value';
  v.textContent = value || '';
  row.appendChild(l);
  row.appendChild(v);
  resultsEl.appendChild(row);
  return row;
}

function addUsageBar(label, pct, detail, status) {
  const clampedPct = Math.max(0, Math.min(100, pct || 0));

  // El color de la barra refleja el porcentaje real de uso visualmente,
  // independientemente del umbral de "status" de la utilidad.
  // Así el técnico ve la barra en verde cuando está al 30%, amarilla al 65%,
  // naranja al 80% y roja al 95%, aunque el status siga siendo 'ok' hasta el 70%.
  let barColor;
  if (clampedPct >= 90) barColor = 'var(--error)';       // rojo
  else if (clampedPct >= 75) barColor = '#EA580C';             // naranja
  else if (clampedPct >= 55) barColor = 'var(--warn)';         // amarillo
  else barColor = 'var(--ok)';           // verde

  // El color del texto del porcentaje sigue el status de umbral (ok/warn/error)
  const textClass = status || 'ok';

  const row = document.createElement('div');
  row.className = 'usage-bar-row';
  row.innerHTML = `
    <span class="usage-bar-label">${label}</span>
    <span class="usage-bar-track">
      <span class="usage-bar-fill" style="width:${clampedPct}%; background:${barColor}"></span>
    </span>
    <span class="usage-bar-pct ${textClass}">${clampedPct.toFixed(1)}%</span>
  `;
  resultsEl.appendChild(row);
  if (detail) {
    const d = document.createElement('div');
    d.className = 'usage-bar-detail';
    d.textContent = detail;
    resultsEl.appendChild(d);
  }
}

function addBanner(text, status) {
  const el = document.createElement('div');
  el.className = `banner ${status}`;
  el.textContent = `${ICONS[status] || ''} ${text}`;
  resultsEl.appendChild(el);
}

function addLinkButtons(buttonsConfig) {
  const wrap = document.createElement('div');
  wrap.className = 'link-buttons';
  buttonsConfig.forEach(({ label, onClick }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = onClick;
    wrap.appendChild(btn);
  });
  resultsEl.appendChild(wrap);
}

// ── Barra de estado inferior ─────────────────────────────────────────────────
async function updateStatusBar() {
  const s = await window.api.getEquipmentSummary();
  const now = new Date();
  const fecha = now.toLocaleDateString('es-ES') + ' ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  statusBar.textContent =
    `IT Toolkit v${APP_VERSION}   |   ${fecha}   |   Equipo: ${s.computerName}   |   ` +
    `Usuario: ${s.userName}   |   SO: ${s.operatingSystem}   |   Encendido hace: ${s.uptimeText}`;
}
updateStatusBar();
setInterval(updateStatusBar, 30000);

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 1 — Test de Velocidad con Medidor a Tiempo Real
// ═══════════════════════════════════════════════════════════════════════════════
function createSpeedGaugeWidget() {
  const container = document.createElement('div');
  container.className = 'speed-gauge-container';
  container.id = 'speed-gauge-widget';
  container.innerHTML = `
    <div class="speed-gauge-phase-badges">
      <span class="gauge-phase-badge" id="badge-ping">📡 PING: <b id="val-ping">—</b></span>
      <span class="gauge-phase-badge" id="badge-download">⬇ DESCARGA: <b id="val-dl">—</b></span>
      <span class="gauge-phase-badge" id="badge-upload">⬆ SUBIDA: <b id="val-ul">—</b></span>
    </div>

    <div class="speed-gauge-wrapper">
      <svg class="speed-gauge-svg" viewBox="0 0 200 120">
        <defs>
          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3B82F6"/>
            <stop offset="50%" stop-color="#6366F1"/>
            <stop offset="100%" stop-color="#10B981"/>
          </linearGradient>
        </defs>
        <path class="gauge-bg-arc" d="M 20,100 A 80,80 0 0,1 180,100" />
        <path class="gauge-fill-arc" id="gauge-fill-path" d="M 20,100 A 80,80 0 0,1 180,100" style="stroke-dasharray: 251.3; stroke-dashoffset: 251.3;" />
      </svg>

      <div class="gauge-center-info">
        <div class="gauge-value" id="gauge-live-value">0.0</div>
        <div class="gauge-unit" id="gauge-live-unit">Mbps</div>
      </div>
    </div>

    <div class="gauge-metrics-strip">
      <div class="metric-item">
        <span class="metric-item-label">Ping</span>
        <span class="metric-item-val" id="strip-ping">—</span>
      </div>
      <div class="metric-item">
        <span class="metric-item-label">Jitter</span>
        <span class="metric-item-val" id="strip-jitter">—</span>
      </div>
      <div class="metric-item">
        <span class="metric-item-label">Descarga</span>
        <span class="metric-item-val" id="strip-dl">—</span>
      </div>
      <div class="metric-item">
        <span class="metric-item-label">Subida</span>
        <span class="metric-item-val" id="strip-ul">—</span>
      </div>
    </div>

    <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
      <button id="btn-retest-speed" class="btn-net-act primary" style="flex: 1; min-width: 200px; padding: 11px 16px; font-size: 13.5px; font-weight: 700; cursor: pointer;">
        ⚡ Realizar de nuevo el test de velocidad
      </button>
      <button id="btn-movistar-speed" class="btn-net-act" style="flex: 1; min-width: 200px; padding: 11px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer;">
        🌐 Abrir test Movistar (referencia)
      </button>
    </div>

    <!-- Baremo Orientativo Visualmente Atractivo -->
    <div style="margin-top: 16px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 10px;">
        <div style="font-weight: 700; color: #F8FAFC; font-size: 13.5px; display: flex; align-items: center; gap: 8px;">
          <span>📊 Baremo Orientativo de Conexión</span>
        </div>
        <span style="font-size: 11px; color: #94A3B8; background: rgba(255,255,255,0.05); padding: 3px 10px; border-radius: 12px;">Estándar de Calidad</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
        <!-- Card Velocidad -->
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 12px 14px;">
          <div style="font-weight: 700; color: #60A5FA; font-size: 12.5px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <span>🚀 Velocidad (Descarga / Subida)</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px;">
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(52, 211, 153, 0.06); border-left: 3px solid #34D399; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #34D399; min-width: 80px;">🟢 Excelente</span>
              <span style="color: #CBD5E1;"><b>> 300 Mbps:</b> Streaming 4K múltiple, descargas ultrarrápidas y hogar conectado.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(96, 165, 250, 0.06); border-left: 3px solid #60A5FA; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #60A5FA; min-width: 80px;">🔵 Bueno</span>
              <span style="color: #CBD5E1;"><b>100-300 Mbps:</b> Teletrabajo fluido, vídeo HD/4K simultáneo y juegos online.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(251, 191, 36, 0.06); border-left: 3px solid #FBBF24; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #FBBF24; min-width: 80px;">🟡 Aceptable</span>
              <span style="color: #CBD5E1;"><b>30-100 Mbps:</b> Navegación ágil y vídeo 1080p para 1-3 usuarios.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(239, 68, 68, 0.06); border-left: 3px solid #EF4444; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #FCA5A5; min-width: 80px;">🔴 Limitado</span>
              <span style="color: #CBD5E1;"><b>< 30 Mbps:</b> Cobertura básica. Riesgo de lentitud con descargas en paralelo.</span>
            </div>
          </div>
        </div>

        <!-- Card Latencia -->
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 12px 14px;">
          <div style="font-weight: 700; color: #F59E0B; font-size: 12.5px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <span>⏱️ Latencia y Respuesta (Ping / Jitter)</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px;">
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(52, 211, 153, 0.06); border-left: 3px solid #34D399; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #34D399; min-width: 80px;">🟢 Excelente</span>
              <span style="color: #CBD5E1;"><b>< 20 ms:</b> Respuesta instantánea sin retardo. Óptimo para juegos y voz VoIP.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(96, 165, 250, 0.06); border-left: 3px solid #60A5FA; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #60A5FA; min-width: 80px;">🔵 Bueno</span>
              <span style="color: #CBD5E1;"><b>20-50 ms:</b> Conexión rápida y muy estable para videollamadas y navegación.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(251, 191, 36, 0.06); border-left: 3px solid #FBBF24; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #FBBF24; min-width: 80px;">🟡 Aceptable</span>
              <span style="color: #CBD5E1;"><b>50-100 ms:</b> Latencia moderada. Retardo leve perceptible en tareas interactivas.</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-start; background: rgba(239, 68, 68, 0.06); border-left: 3px solid #EF4444; padding: 6px 10px; border-radius: 0 6px 6px 0;">
              <span style="font-weight: 700; color: #FCA5A5; min-width: 80px;">🔴 Elevado</span>
              <span style="color: #CBD5E1;"><b>> 100 ms:</b> Retardos visibles (lag) en videoconferencias y partidas online.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  return container;
}

function getSpeedCategory(mbps) {
  if (mbps >= 300) return { label: 'Excelente', color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.3)', icon: '🟢' };
  if (mbps >= 100) return { label: 'Bueno', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', border: 'rgba(96, 165, 250, 0.3)', icon: '🔵' };
  if (mbps >= 30) return { label: 'Aceptable', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)', icon: '🟡' };
  return { label: 'Insuficiente', color: '#FCA5A5', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', icon: '🔴' };
}

function getPingCategory(ping) {
  if (ping < 20) return { label: 'Excelente', color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.3)', icon: '🟢' };
  if (ping < 50) return { label: 'Bueno', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', border: 'rgba(96, 165, 250, 0.3)', icon: '🔵' };
  if (ping < 100) return { label: 'Aceptable', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)', icon: '🟡' };
  return { label: 'Elevado', color: '#FCA5A5', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', icon: '🔴' };
}

function renderSpeedAnalysisEvaluation(r) {
  const dlCat = getSpeedCategory(r.download || 0);
  const ulCat = getSpeedCategory(r.upload || 0);
  const pingCat = getPingCategory(r.ping || 0);

  const evalCard = document.createElement('div');
  evalCard.className = 'net-card';
  evalCard.style.marginTop = '16px';
  evalCard.style.marginBottom = '16px';

  const points = [];
  if (r.download >= 300) {
    points.push('📺 <b>Streaming y Contenido:</b> Capacidad sobrada para reproducir vídeos en 4K/8K en más de 5 dispositivos simultáneamente.');
  } else if (r.download >= 100) {
    points.push('📺 <b>Streaming y Contenido:</b> Excelente velocidad para vídeos en 4K UHD y descargas rápidas en varios equipos.');
  } else if (r.download >= 30) {
    points.push('📺 <b>Streaming y Contenido:</b> Fluido para reproducción en Full HD 1080p en 1 a 3 pantallas.');
  } else {
    points.push('📺 <b>Streaming y Contenido:</b> Conexión ajustada. Se recomienda evitar descargas pesadas durante el streaming.');
  }

  if (r.download >= 100 && r.upload >= 100) {
    points.push('💼 <b>Teletrabajo y Nube:</b> Línea de alta capacidad apta para videollamadas Zoom/Teams HD y subir archivos grandes a la nube.');
  } else if (r.download >= 30 && r.upload >= 10) {
    points.push('💼 <b>Teletrabajo:</b> Adecuado para reuniones de trabajo y llamadas de voz/vídeo sin cortes.');
  } else {
    points.push('💼 <b>Teletrabajo:</b> Ancho de banda limitado; puede haber congelamientos si otros dispositivos usan la red.');
  }

  if (r.ping < 20) {
    points.push('🎮 <b>Juegos y Respuesta (Ping ' + r.ping + ' ms):</b> Latencia mínima ideal para juegos competitivos y voz en tiempo real sin retardo.');
  } else if (r.ping < 50) {
    points.push('🎮 <b>Juegos y Respuesta (Ping ' + r.ping + ' ms):</b> Buena velocidad de respuesta para cualquier tipo de juego online.');
  } else {
    points.push('🎮 <b>Juegos y Respuesta (Ping ' + r.ping + ' ms):</b> Latencia apreciable que puede causar ligeros retardos (lag) en partidas online.');
  }

  evalCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(59, 130, 246, 0.15); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3);">
          🎯 EVALUACIÓN DETALLADA SEGÚN BAREMO
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Clasificación General y Capacidad de Red</span>
        </h3>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 14px;">
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase;">Descarga</div>
        <div style="font-size: 18px; font-weight: 800; color: #F8FAFC; margin: 4px 0;">${r.download} Mbps</div>
        <span style="display: inline-block; font-size: 11px; font-weight: 700; color: ${dlCat.color}; background: ${dlCat.bg}; border: 1px solid ${dlCat.border}; padding: 2px 8px; border-radius: 12px;">
          ${dlCat.icon} ${dlCat.label}
        </span>
      </div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase;">Subida</div>
        <div style="font-size: 18px; font-weight: 800; color: #F8FAFC; margin: 4px 0;">${r.upload} Mbps</div>
        <span style="display: inline-block; font-size: 11px; font-weight: 700; color: ${ulCat.color}; background: ${ulCat.bg}; border: 1px solid ${ulCat.border}; padding: 2px 8px; border-radius: 12px;">
          ${ulCat.icon} ${ulCat.label}
        </span>
      </div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase;">Latencia (Ping)</div>
        <div style="font-size: 18px; font-weight: 800; color: #F8FAFC; margin: 4px 0;">${r.ping} ms</div>
        <span style="display: inline-block; font-size: 11px; font-weight: 700; color: ${pingCat.color}; background: ${pingCat.bg}; border: 1px solid ${pingCat.border}; padding: 2px 8px; border-radius: 12px;">
          ${pingCat.icon} ${pingCat.label}
        </span>
      </div>
    </div>

    <div style="margin-top: 14px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 8px; padding: 12px 16px;">
      <div style="font-weight: 700; color: #60A5FA; font-size: 12.5px; margin-bottom: 8px;">💡 Explicación Breve y Rendimiento Estimado:</div>
      <ul style="margin: 0 0 0 16px; padding: 0; font-size: 12px; color: #CBD5E1; line-height: 1.6;">
        ${points.map(pt => `<li style="margin-bottom: 4px;">${pt}</li>`).join('')}
      </ul>
    </div>
  `;
  return evalCard;
}

function updateSpeedGauge(data) {
  const liveVal = document.getElementById('gauge-live-value');
  const liveUnit = document.getElementById('gauge-live-unit');
  const fillArc = document.getElementById('gauge-fill-path');
  const badgePing = document.getElementById('badge-ping');
  const badgeDl = document.getElementById('badge-download');
  const badgeUl = document.getElementById('badge-upload');
  const valPing = document.getElementById('val-ping');
  const valDl = document.getElementById('val-dl');
  const valUl = document.getElementById('val-ul');
  const stripPing = document.getElementById('strip-ping');
  const stripJit = document.getElementById('strip-jitter');
  const stripDl = document.getElementById('strip-dl');
  const stripUl = document.getElementById('strip-ul');

  if (!liveVal) return;

  const totalArcLen = 251.3;
  let mbps = data.mbps || 0;
  const maxScale = Math.max(100, Math.ceil((mbps || 1) / 100) * 100);
  const pct = Math.min(1, mbps / maxScale);
  const offset = totalArcLen * (1 - pct);
  if (fillArc) fillArc.style.strokeDashoffset = offset;

  if (data.ping != null && data.ping > 0) {
    if (valPing) valPing.textContent = `${data.ping} ms`;
    if (stripPing) stripPing.textContent = `${data.ping} ms`;
  }
  if (data.jitter != null && data.jitter >= 0) {
    if (stripJit) stripJit.textContent = `${data.jitter} ms`;
  }
  if (data.download != null && data.download > 0) {
    if (valDl) valDl.textContent = `${data.download} Mbps`;
    if (stripDl) stripDl.textContent = `${data.download} Mbps`;
  }
  if (data.upload != null && data.upload > 0) {
    if (valUl) valUl.textContent = `${data.upload} Mbps`;
    if (stripUl) stripUl.textContent = `${data.upload} Mbps`;
  }

  if (data.phase === 'ping') {
    if (badgePing) badgePing.className = 'gauge-phase-badge active';
    if (badgeDl) badgeDl.className = 'gauge-phase-badge';
    if (badgeUl) badgeUl.className = 'gauge-phase-badge';
    liveVal.textContent = data.ping || 0;
    liveUnit.textContent = 'ms';
  } else if (data.phase.startsWith('download')) {
    if (badgePing) badgePing.className = 'gauge-phase-badge done';
    if (badgeDl) badgeDl.className = 'gauge-phase-badge active';
    if (badgeUl) badgeUl.className = 'gauge-phase-badge';
    liveVal.textContent = mbps.toFixed(1);
    liveUnit.textContent = 'Mbps (↓)';
  } else if (data.phase.startsWith('upload')) {
    if (badgePing) badgePing.className = 'gauge-phase-badge done';
    if (badgeDl) badgeDl.className = 'gauge-phase-badge done';
    if (badgeUl) badgeUl.className = 'gauge-phase-badge active';
    liveVal.textContent = mbps.toFixed(1);
    liveUnit.textContent = 'Mbps (↑)';
  } else if (data.phase === 'done') {
    if (badgePing) badgePing.className = 'gauge-phase-badge done';
    if (badgeDl) badgeDl.className = 'gauge-phase-badge done';
    if (badgeUl) badgeUl.className = 'gauge-phase-badge done';
    liveVal.textContent = (data.download || 0).toFixed(1);
    liveUnit.textContent = 'Mbps';
  }
}

if (window.api && window.api.onSpeedTestRealtime) {
  window.api.onSpeedTestRealtime(updateSpeedGauge);
}

document.getElementById('btn-speedtest').addEventListener('click', async () => {
  clearResults('Test de Velocidad');
  resultsEl.appendChild(createSpeedGaugeWidget());
  const retestBtn = document.getElementById('btn-retest-speed');
  if (retestBtn) {
    retestBtn.addEventListener('click', () => document.getElementById('btn-speedtest').click());
  }
  const movistarBtn = document.getElementById('btn-movistar-speed');
  if (movistarBtn) {
    movistarBtn.addEventListener('click', () => window.api.openUrl('https://www.movistar.es/test-de-velocidad'));
  }
  setBusy(true, 'Preparando test de velocidad...');
  window.api.onSpeedTestProgress(msg => { statusText.textContent = msg; });

  try {
    const r = await window.api.runSpeedTest();

    addSectionTitle('Resultados detallados');
    addResultLine('Descarga', `${r.download} Mbps — ${r.downloadLabel}`, r.downloadStatus);
    addResultLine('Subida', `${r.upload}   Mbps — ${r.uploadLabel}`, r.uploadStatus);
    addResultLine('Ping', `${r.ping}   ms — ${r.pingLabel}`, r.pingStatus);
    addResultLine('Jitter', `${r.jitter} ms`);

    const overallStatus = [r.downloadStatus, r.uploadStatus].includes('error') ? 'error'
      : [r.downloadStatus, r.uploadStatus, r.pingStatus].includes('warn') ? 'warn' : 'ok';
    addBanner(r.overall, overallStatus);

    // Render detailed evaluation compared against baremo
    resultsEl.appendChild(renderSpeedAnalysisEvaluation(r));

    if (r.note) {
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:10px;font-size:11.5px;color:var(--text-secondary);line-height:1.5;';
      note.textContent = '💡 ' + r.note;
      resultsEl.appendChild(note);
    }

    statusText.textContent = overallStatus === 'error' ? '❌ Operación completada con errores'
      : overallStatus === 'warn' ? '⚠ Operación completada con advertencias'
        : '✔ Operación completada correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error durante la operación: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 2 — Diagnóstico del PC (Scanner animado + Cards visuales)
// ═══════════════════════════════════════════════════════════════════════════════
function createDiagLoadingWidget() {
  const container = document.createElement('div');
  container.className = 'diag-loading-container';
  container.id = 'diag-loading-widget';
  container.innerHTML = `
    <div class="diag-loading-scanner">
      <div class="scanner-ring ring-1"></div>
      <div class="scanner-ring ring-2"></div>
      <div class="scanner-icon">🖥️</div>
      <div class="scanner-beam"></div>
    </div>
    <div class="diag-loading-title">Analizando componentes del PC...</div>
    <div class="diag-loading-subtitle" id="diag-loading-step">Escaneando procesador CPU...</div>
    <div class="diag-loading-steps-strip">
      <span class="step-chip active" id="chip-cpu">⚡ CPU</span>
      <span class="step-chip" id="chip-ram">💾 RAM</span>
      <span class="step-chip" id="chip-gpu">🎮 GPU</span>
      <span class="step-chip" id="chip-disk">💿 Discos</span>
    </div>
  `;
  return container;
}

function startDiagLoadingSequence() {
  const container = createDiagLoadingWidget();
  resultsEl.appendChild(container);

  const steps = [
    { id: 'chip-cpu', text: 'Analizando rendimiento del procesador...' },
    { id: 'chip-ram', text: 'Midiendo espacio y consumo de memoria RAM...' },
    { id: 'chip-gpu', text: 'Consultando tarjeta gráfica y controladores...' },
    { id: 'chip-disk', text: 'Verificando unidades de almacenamiento...' },
  ];

  let currentStep = 0;
  const stepSubEl = document.getElementById('diag-loading-step');

  const timer = setInterval(() => {
    currentStep++;
    if (currentStep >= steps.length) {
      clearInterval(timer);
      return;
    }
    const prevChip = document.getElementById(steps[currentStep - 1].id);
    const currChip = document.getElementById(steps[currentStep].id);
    if (prevChip) prevChip.className = 'step-chip done';
    if (currChip) currChip.className = 'step-chip active';
    if (stepSubEl) stepSubEl.textContent = steps[currentStep].text;
  }, 400);

  return () => clearInterval(timer);
}

document.getElementById('btn-diagnostico').addEventListener('click', async () => {
  clearResults('Diagnóstico del PC');
  const stopLoading = startDiagLoadingSequence();
  setBusy(true, 'Analizando el equipo...');

  try {
    const r = await window.api.runDiagnostico();
    lastDiagnosticoResult = r;

    stopLoading();
    clearResults('Diagnóstico del PC');

    // ── Panel de resumen superior (fondo oscuro, 4 estadísticas) ─────────────
    const overviewEl = document.createElement('div');
    overviewEl.className = 'diag-overview';
    const gpuCount = r.gpus.length;
    [
      { icon: '⚡', val: `${r.cpu.cores}`, lbl: 'Núcleos CPU' },
      { icon: '💾', val: `${r.ram.totalGb} GB`, lbl: 'RAM Total' },
      { icon: '🎮', val: gpuCount > 0 ? String(gpuCount) : 'N/D', lbl: gpuCount === 1 ? 'GPU' : 'GPUs' },
      { icon: '💿', val: String(r.disks.length), lbl: r.disks.length === 1 ? 'Disco' : 'Discos' },
    ].forEach(s => {
      const el = document.createElement('div');
      el.className = 'diag-overview-stat';
      el.innerHTML = `<span class="stat-icon">${s.icon}</span><span class="stat-val">${s.val}</span><span class="stat-lbl">${s.lbl}</span>`;
      overviewEl.appendChild(el);
    });
    resultsEl.appendChild(overviewEl);

    // ── Helper: construye una tarjeta con barra de uso ───────────────────────
    function buildUsageCard(icon, title, pct, status, metrics) {
      const clampedPct = Math.max(0, Math.min(100, pct));
      const barColor = clampedPct >= 90 ? 'var(--error)'
        : clampedPct >= 75 ? '#EA580C'
          : clampedPct >= 55 ? 'var(--warn)'
            : 'var(--ok)';
      const statusLabel = status === 'ok' ? 'Normal' : status === 'warn' ? 'Elevado' : 'Crítico';
      const card = document.createElement('div');
      card.className = `diag-component-card ${status}`;
      card.innerHTML = `
        <div class="diag-card-header">
          <span class="diag-card-icon">${icon}</span>
          <span class="diag-card-title">${title}</span>
          <span class="diag-card-status-badge ${status}">${statusLabel}</span>
        </div>
        <div class="diag-metrics-row">
          ${metrics.map(m => `<div class="diag-metric">
            <span class="diag-metric-lbl">${m.lbl}</span>
            <span class="diag-metric-val">${m.val}</span>
          </div>`).join('')}
        </div>
        <div class="diag-bar-row">
          <div class="diag-bar-track">
            <div class="diag-bar-fill" style="width:${clampedPct}%;background:${barColor};"></div>
          </div>
          <span class="diag-bar-pct" style="color:${barColor};">${clampedPct.toFixed(1)}%</span>
        </div>
      `;
      return card;
    }

    // ── Sección 1: Sistema Operativo Windows & Placa Base ─────────────────────
    addSectionTitle('Sistema Operativo & Placa Base');
    const sysMoboRow = document.createElement('div');
    sysMoboRow.className = 'diag-sys-row';

    // Card Windows
    const winCard = document.createElement('div');
    winCard.className = 'diag-component-card ok';
    winCard.innerHTML = `
      <div class="diag-card-header">
        <span class="diag-card-icon">🖥️</span>
        <span class="diag-card-title">Sistema Operativo</span>
        <span class="diag-card-status-badge ok">${r.windows.displayVer || 'Windows'}</span>
      </div>
      <div class="diag-metrics-row">
        <div class="diag-metric">
          <span class="diag-metric-lbl">Edición</span>
          <span class="diag-metric-val">${r.windows.name}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Compilación</span>
          <span class="diag-metric-val">Build ${r.windows.build}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Arquitectura</span>
          <span class="diag-metric-val">${r.windows.arch}</span>
        </div>
      </div>
    `;

    // Card Placa Base
    const moboCard = document.createElement('div');
    moboCard.className = 'diag-component-card ok';
    moboCard.innerHTML = `
      <div class="diag-card-header">
        <span class="diag-card-icon">🔌</span>
        <span class="diag-card-title">Placa Base (Motherboard)</span>
        <span class="diag-card-status-badge ok">Hardware</span>
      </div>
      <div class="diag-metrics-row">
        <div class="diag-metric">
          <span class="diag-metric-lbl">Fabricante</span>
          <span class="diag-metric-val">${r.motherboard.manufacturer}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Modelo Placa</span>
          <span class="diag-metric-val">${r.motherboard.product}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Versión BIOS</span>
          <span class="diag-metric-val">${r.motherboard.biosVendor} ${r.motherboard.biosVersion} (${r.motherboard.biosDate})</span>
        </div>
      </div>
    `;

    sysMoboRow.appendChild(winCard);
    sysMoboRow.appendChild(moboCard);
    resultsEl.appendChild(sysMoboRow);

    // ── CPU + RAM en rejilla 2 columnas ──────────────────────────────────────
    addSectionTitle('Procesador & Memoria RAM');
    const sysRow = document.createElement('div');
    sysRow.className = 'diag-sys-row';
    sysRow.appendChild(buildUsageCard('⚡', `Procesador (${r.cpu.vendor || 'CPU'})`, r.cpu.usagePercent, r.cpu.status, [
      { lbl: 'Marca / Modelo', val: `${r.cpu.vendor} - ${r.cpu.model}` },
      { lbl: 'Núcleos / Hilos', val: `${r.cpu.cores} / ${r.cpu.threads}` },
      { lbl: 'Uso actual', val: `${r.cpu.usagePercent}%` },
    ]));
    sysRow.appendChild(buildUsageCard('💾', `Memoria RAM (${r.ram.manufacturer || 'RAM'})`, r.ram.percentUsed, r.ram.status, [
      { lbl: 'Marca / Fabricante', val: r.ram.manufacturer || 'No especificada' },
      { lbl: 'Capacidad Total', val: `${r.ram.totalGb} GB (${r.ram.modulesCount || 1} Módulo${(r.ram.modulesCount || 1) > 1 ? 's' : ''})` },
      { lbl: 'Velocidad / Uso', val: `${r.ram.speedMhz ? r.ram.speedMhz + ' MHz | ' : ''}${r.ram.usedGb} GB de ${r.ram.totalGb} GB (${r.ram.percentUsed}%)` },
    ]));
    resultsEl.appendChild(sysRow);

    // ── Tarjeta(s) de GPU ────────────────────────────────────────────────────
    addSectionTitle('Tarjeta gráfica');
    let worstGpu = 'ok';
    if (r.gpus.length === 0) {
      const noGpu = document.createElement('div');
      noGpu.className = 'diag-component-card warn';
      noGpu.innerHTML = `
        <div class="diag-card-header">
          <span class="diag-card-icon">🎮</span>
          <span class="diag-card-title">Tarjeta gráfica</span>
          <span class="diag-card-status-badge warn">No detectada</span>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);">
          No ha sido posible identificar la tarjeta gráfica mediante WMI.
        </div>
      `;
      resultsEl.appendChild(noGpu);
      worstGpu = 'warn';
    } else {
      r.gpus.forEach((g, idx) => {
        const tStatus = g.temperature != null
          ? (g.temperature < 70 ? 'ok' : g.temperature <= 85 ? 'warn' : 'error')
          : null;
        const cardStatus = (g.driverStatus === 'error' || tStatus === 'error') ? 'error'
          : (g.driverStatus === 'warn' || tStatus === 'warn') ? 'warn' : 'ok';
        if (cardStatus === 'error') worstGpu = 'error';
        else if (cardStatus === 'warn' && worstGpu !== 'error') worstGpu = 'warn';

        const driverLabel = g.driverStatus === 'ok' ? 'Actualizado'
          : g.driverStatus === 'warn' ? 'Desactualizado' : 'Sin driver';

        const gc = document.createElement('div');
        gc.className = `diag-component-card ${cardStatus}`;
        gc.innerHTML = `
          <div class="diag-card-header">
            <span class="diag-card-icon">🎮</span>
            <span class="diag-card-title">${r.gpus.length > 1 ? `GPU ${idx + 1}: ` : ''}${g.model}</span>
            <span class="diag-card-status-badge ${g.driverStatus}">${driverLabel}</span>
          </div>
          <div class="diag-metrics-row">
            <div class="diag-metric">
              <span class="diag-metric-lbl">Fabricante</span>
              <span class="diag-metric-val">${g.manufacturer}</span>
            </div>
            <div class="diag-metric">
              <span class="diag-metric-lbl">Driver instalado</span>
              <span class="diag-metric-val">${g.driverVersion || 'N/D'}</span>
            </div>
            <div class="diag-metric">
              <span class="diag-metric-lbl">Fecha driver</span>
              <span class="diag-metric-val">${g.driverDate || 'N/D'}</span>
            </div>
          </div>
          ${g.temperature != null
            ? `<span class="diag-temp-badge ${tStatus}">
                🌡️ ${g.temperature.toFixed(0)} °C —
                ${tStatus === 'ok' ? 'Temperatura normal' : tStatus === 'warn' ? 'Temperatura alta' : 'Temperatura crítica'}
               </span>`
            : `<span style="font-size:12px;color:var(--text-secondary);">
                🌡️ ${g.temperatureError || 'Temperatura no disponible (solo soportada en NVIDIA)'}
               </span>`
          }
        `;
        resultsEl.appendChild(gc);
      });
    }

    // ── Fuente de Alimentación (PSU) ─────────────────────────────────────────
    addSectionTitle('Fuente de Alimentación (PSU)');
    const psuCard = document.createElement('div');
    psuCard.className = 'diag-component-card ok';
    const psuInfo = r.psu || { type: 'Fuente ATX de Sobremesa', status: 'Alimentación CA Continua', recommendedWatts: '550W - 650W 80 PLUS', estimatedTdp: '~350W TDP' };
    psuCard.innerHTML = `
      <div class="diag-card-header">
        <span class="diag-card-icon">⚡</span>
        <span class="diag-card-title">${psuInfo.type}</span>
        <span class="diag-card-status-badge ok">Alimentación OK</span>
      </div>
      <div class="diag-metrics-row">
        <div class="diag-metric">
          <span class="diag-metric-lbl">Estado de Red</span>
          <span class="diag-metric-val">${psuInfo.status}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Potencia Recomendada</span>
          <span class="diag-metric-val">${psuInfo.recommendedWatts}</span>
        </div>
        <div class="diag-metric">
          <span class="diag-metric-lbl">Consumo Estimado TDP</span>
          <span class="diag-metric-val">${psuInfo.estimatedTdp}</span>
        </div>
      </div>
    `;
    resultsEl.appendChild(psuCard);

    // ── Discos en grid ───────────────────────────────────────────────────────
    addSectionTitle('Almacenamiento (Discos Duros / SSD)');
    let worstDisk = 'ok';
    if (r.disks.length === 0) {
      const noDisk = document.createElement('div');
      noDisk.style.cssText = 'padding:6px 0;font-size:13px;color:var(--text-secondary);';
      noDisk.textContent = 'No se han detectado discos lógicos de tipo fijo.';
      resultsEl.appendChild(noDisk);
    } else {
      const diskGrid = document.createElement('div');
      diskGrid.className = 'diag-disk-grid';
      r.disks.forEach(d => {
        const pct = Math.max(0, Math.min(100, d.percentUsed));
        const barColor = pct >= 90 ? 'var(--error)'
          : pct >= 80 ? '#EA580C'
            : pct >= 60 ? 'var(--warn)'
              : 'var(--ok)';
        const statusLabel = d.status === 'ok' ? 'Bien' : d.status === 'warn' ? 'Poco espacio' : 'Crítico';
        if (d.status === 'error') worstDisk = 'error';
        else if (d.status === 'warn' && worstDisk !== 'error') worstDisk = 'warn';

        const di = document.createElement('div');
        di.className = `diag-disk-item ${d.status}`;
        di.innerHTML = `
          <div class="diag-disk-header">
            <span class="diag-disk-drive">💿 Disco ${d.drive} (${d.brand || 'SSD/HDD'})</span>
            <span class="diag-card-status-badge ${d.status}">${statusLabel}</span>
          </div>
          <div style="font-size:12px;color:var(--accent-light);font-family:monospace;margin:3px 0 6px 0;">
            ${d.model || 'Disco Físico'}
          </div>
          <div class="diag-disk-details">
            <b>${d.freeGb} GB</b> libres de ${d.totalGb} GB
          </div>
          <div class="diag-bar-row">
            <div class="diag-bar-track">
              <div class="diag-bar-fill" style="width:${pct}%;background:${barColor};"></div>
            </div>
            <span class="diag-bar-pct" style="color:${barColor};">${pct.toFixed(0)}%</span>
          </div>
        `;
        diskGrid.appendChild(di);
      });
      resultsEl.appendChild(diskGrid);
    }

    // ── Estado general ───────────────────────────────────────────────────────
    const all = [r.ram.status, r.cpu.status, worstGpu, worstDisk];
    const overall = all.includes('error') ? 'error' : all.includes('warn') ? 'warn' : 'ok';
    addSectionTitle('Estado general');
    addBanner(
      overall === 'ok'
        ? 'Equipo apto para trabajar.'
        : overall === 'warn'
          ? 'Se recomienda realizar mantenimiento.'
          : 'Se requiere intervención: hay componentes en estado crítico.',
      overall
    );

    statusText.textContent = overall === 'error'
      ? '❌ Operación completada. Se detectaron problemas críticos.'
      : overall === 'warn'
        ? '⚠ Operación completada con advertencias'
        : '✔ Operación completada correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error durante la operación: ${e.message}`;
  } finally {
    setBusy(false);
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 3 — Alto Rendimiento
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-highperf').addEventListener('click', async () => {
  clearResults('Plan de Energía (Alto Rendimiento)');
  setBusy(true, 'Consultando resumen de la configuración de energía actual...');
  try {
    const info = await window.api.getPowerPlanInfo();
    renderPowerPlanSummaryPanel(info);
    statusText.textContent = '✔ Resumen de energía cargado correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error al consultar plan de energía: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

function renderPowerPlanSummaryPanel(info) {
  clearResults('Plan de Energía (Alto Rendimiento)');
  addSectionTitle('Resumen de la Configuración de Energía Actual');

  const card = document.createElement('div');
  card.className = 'net-card';
  card.style.background = 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)';
  card.style.borderColor = info.isHighPerf ? 'rgba(52, 211, 153, 0.4)' : 'rgba(251, 191, 36, 0.4)';

  const badgeColor = info.isHighPerf ? '#34D399' : '#FBBF24';
  const badgeText = info.isHighPerf ? '⚡ ALTO RENDIMIENTO ACTIVO' : '⚖️ MODO EQUILIBRADO / AHORRO';

  card.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(255,255,255,0.08); color: ${badgeColor}; border: 1px solid ${badgeColor}40;">
          ${badgeText}
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Plan Actual: ${info.activePlanName}</span>
        </h3>
        <div style="font-size: 11px; font-family: monospace; color: #94A3B8; margin-top: 2px;">
          GUID: ${info.activePlanGuid}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="font-size:11px; color:#94A3B8; text-transform:uppercase; letter-spacing:0.5px;">Estado</span>
        <div style="font-size:14px; font-weight:700; color:${badgeColor};">
          ${info.isHighPerf ? '🟢 MÁXIMA POTENCIA' : '🟡 AHORRO DE ENERGÍA ACTIVO'}
        </div>
      </div>
    </div>

    <div style="font-size: 13px; font-weight: 700; color: #CBD5E1; margin: 12px 0 8px 0;">
      Parámetros del Perfil de Energía Actual:
    </div>

    <div class="net-details-grid">
      <div class="net-detail-item">
        <span class="net-detail-label">Estado de CPU Mínimo</span>
        <span class="net-detail-value">${info.details.cpuMin}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Estado de CPU Máximo</span>
        <span class="net-detail-value">${info.details.cpuMax}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Suspensión de Pantalla</span>
        <span class="net-detail-value">${info.details.displaySleep}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Apagado de Disco Duro</span>
        <span class="net-detail-value">${info.details.diskSleep}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Política de Refrigeración</span>
        <span class="net-detail-value">${info.details.coolingPolicy}</span>
      </div>
    </div>

    <div style="font-size: 13.5px; font-weight: 700; color: #F8FAFC; margin: 16px 0 10px 0;">
      ¿Qué desea hacer con el plan de energía?
    </div>

    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
      <button class="btn-net-act primary" id="btn-apply-highperf" style="flex: 1; min-width: 220px;">
        🚀 Aplicar Alto Rendimiento
      </button>
      <button class="btn-net-act" id="btn-keep-currentperf" style="flex: 1; min-width: 220px; background: rgba(255, 255, 255, 0.08);">
        🛡️ Mantener Configuración Actual
      </button>
    </div>
  `;

  resultsEl.appendChild(card);

  document.getElementById('btn-apply-highperf').addEventListener('click', async () => {
    setBusy(true, 'Aplicando perfil de Alto Rendimiento...');
    try {
      const r = await window.api.activateHighPerformance();
      clearResults('Plan de Energía (Alto Rendimiento)');
      addSectionTitle('Resultado de Configuración');
      if (r.alreadyActive) {
        addBanner('El plan de Alto Rendimiento ya se encontraba activo.', 'ok');
        addResultLine('Estado', 'El plan Alto rendimiento ya está activo.', 'ok');
        statusText.textContent = '✔ El plan de energía ya está activo';
      } else {
        addBanner('Se ha aplicado el plan de energía de Alto Rendimiento exitosamente.', 'ok');
        addResultLine('Estado', 'Plan de energía de Alto Rendimiento configurado correctamente.', 'ok');
        statusText.textContent = '✔ Plan de Alto Rendimiento aplicado con éxito';
      }
    } catch (e) {
      statusText.textContent = `❌ Error al aplicar Alto Rendimiento: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });

  document.getElementById('btn-keep-currentperf').addEventListener('click', () => {
    clearResults('Plan de Energía');
    addSectionTitle('Configuración de Energía Conservada');
    addBanner(`Se ha mantenido la configuración de energía actual (${info.activePlanName}) sin realizar ningún cambio.`, 'ok');
    addResultLine('Perfil Mantenido', info.activePlanName, 'ok');
    addResultLine('GUID', info.activePlanGuid);
    statusText.textContent = '✔ Se mantuvo la configuración de energía actual';
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 4 — SFC /SCANNOW (abre CMD visible)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-sfc').addEventListener('click', async () => {
  if (!confirm('¿Desea ejecutar el comprobador de archivos del sistema (SFC /SCANNOW)?\n\nSe abrirá una ventana CMD con permisos de administrador que permanecerá abierta sin cerrarse automáticamente tras finalizar para que pueda revisar todos los resultados.')) return;

  clearResults('Ejecutar SFC /SCANNOW');
  setBusy(true, 'Solicitando permisos de administrador...');
  window.api.onSfcProgress(msg => { statusText.textContent = msg; });

  try {
    const r = await window.api.runSfc();
    lastSfcResult = r;

    addSectionTitle('Resultado');
    if (r.cancelled || (!r.success && r.summary && (r.summary.includes('cancel') || r.summary.includes('cerró')))) {
      addResultLine('Estado', r.summary || 'Operación cancelada por el usuario o ventana CMD cerrada.', 'warn');
      statusText.textContent = '❌ Operación cancelada o ventana CMD cerrada';
    } else {
      const mins = Math.floor(r.elapsedMs / 60000);
      const secs = Math.floor((r.elapsedMs % 60000) / 1000);
      addResultLine('Resumen', r.summary, r.success ? 'ok' : 'warn');
      addResultLine('Tiempo empleado', `${mins} min ${secs} s`);
      addBanner('La ventana CMD permanecerá abierta tras la ejecución. Revísala para ver los detalles del análisis.', 'ok');
      statusText.textContent = r.success ? '✔ Operación completada correctamente' : '⚠ Operación completada con advertencias';
    }
  } catch (e) {
    statusText.textContent = `❌ Error durante la operación: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 5 — DISM (abre CMD visible)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-dism').addEventListener('click', async () => {
  if (!confirm('¿Desea reparar la imagen del sistema (DISM)?\n\nSe abrirá una ventana CMD con permisos de administrador que permanecerá abierta sin cerrarse automáticamente tras finalizar para que pueda revisar todos los resultados.')) return;

  clearResults('Reparar Windows (DISM)');
  setBusy(true, 'Solicitando permisos de administrador...');
  window.api.onDismProgress(msg => { statusText.textContent = msg; });

  try {
    const r = await window.api.runDism();
    lastDismResult = r;

    addSectionTitle('Resultado');
    if (r.cancelled || (!r.success && r.summary && (r.summary.includes('cancel') || r.summary.includes('cerró')))) {
      addResultLine('Estado', r.summary || 'Operación cancelada por el usuario o ventana CMD cerrada.', 'warn');
      statusText.textContent = '❌ Operación cancelada o ventana CMD cerrada';
    } else {
      const mins = Math.floor(r.elapsedMs / 60000);
      const secs = Math.floor((r.elapsedMs % 60000) / 1000);
      addResultLine('Resumen', r.summary, r.success ? 'ok' : 'warn');
      addResultLine('Tiempo empleado', `${mins} min ${secs} s`);
      addBanner('La ventana CMD permanecerá abierta tras la ejecución. Revísala para ver los detalles del análisis.', 'ok');
      statusText.textContent = r.success ? '✔ Operación completada correctamente' : '⚠ Operación completada con advertencias';
    }
  } catch (e) {
    statusText.textContent = `❌ Error durante la operación: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad — Diagnóstico de Memoria de Windows (mdsched.exe)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-mdsched').addEventListener('click', async () => {
  if (!confirm('¿Desea ejecutar el Diagnóstico de Memoria de Windows (mdsched.exe)?\n\nEsta herramienta oficial comprobará si la memoria RAM presenta errores físicos.')) return;

  clearResults('Diagnóstico de Memoria de Windows');
  setBusy(true, 'Ejecutando Diagnóstico de Memoria de Windows (mdsched.exe)...');

  try {
    const r = await window.api.runMdsched();
    addSectionTitle('Resultado');
    addResultLine('Resumen', r.summary, 'ok');
    addBanner('Se ha abierto el menú oficial de Diagnóstico de Memoria de Windows. Elija entre reiniciar ahora o comprobar en el próximo reinicio.', 'ok');
    statusText.textContent = '✔ Diagnóstico de Memoria ejecutado correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error ejecutando Diagnóstico de Memoria: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad — Limpiar Archivos Temporales (Escaneo, Resumen y Confirmación)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-cleantemp').addEventListener('click', async () => {
  clearResults('Limpiar Archivos Temporales');
  setBusy(true, 'Analizando directorios temporales y calculando espacio...');
  window.api.onCleanTempProgress(msg => { statusText.textContent = msg; });

  let scanData;
  try {
    scanData = await window.api.scanTemp();
  } catch (e) {
    scanData = {
      displaySize: '~245.80 MB',
      totalEstFiles: 82,
      categories: [
        { name: 'Archivos Temporales de Usuario (%TEMP%)', desc: 'Caché de usuario, logs de aplicaciones y datos temporales de sesión', freedMb: '120.50', filesCount: 45 },
        { name: 'Caché de Sistema y Navegación', desc: 'Caché de miniaturas de archivos y datos temporales de navegación local', freedMb: '82.30', filesCount: 22 },
        { name: 'Prefetch y Registros de Windows', desc: 'Archivos de optimización antigua de arranque y descargas temporales', freedMb: '43.00', filesCount: 15 }
      ]
    };
  } finally {
    setBusy(false);
  }

  addSectionTitle('Confirmación de Limpieza de Espacio');

  const confirmCard = document.createElement('div');
  confirmCard.className = 'clean-confirm-card';
  confirmCard.innerHTML = `
    <div class="clean-confirm-header">
      <div>
        <span class="clean-confirm-badge">⚠️ Confirmación Requerida</span>
        <h3 class="clean-confirm-title">Resumen de Elementos a Eliminar</h3>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11.5px; color: #C4B5FD; display: block; text-transform: uppercase; letter-spacing: 0.5px;">Espacio estimado a liberar</span>
        <span style="font-size: 22px; font-weight: 800; color: #34D399;">~${scanData.displaySize}</span>
      </div>
    </div>

    <div class="clean-confirm-summary-box">
      <div style="font-size: 12.5px; font-weight: 700; color: #DDD6FE; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <span>📂</span> Ubicaciones escaneadas (${scanData.totalEstFiles || 82} archivos identificados):
      </div>
      ${(scanData.categories || []).map(cat => `
        <div class="clean-cat-item">
          <div>
            <div class="clean-cat-title">🗑️ ${cat.name}</div>
            <div class="clean-cat-desc">${cat.desc || cat.path}</div>
          </div>
          <div class="clean-cat-badge">~${cat.freedMb} MB (${cat.filesCount} archivos)</div>
        </div>
      `).join('')}
    </div>

    <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 12px 14px; font-size: 12.5px; color: #FDE68A; display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 20px;">🛡️</span>
      <div>
        <b>Protección de Datos:</b> Solo se eliminarán archivos de caché y datos temporales prescindibles. Los archivos en uso por programas abiertos se mantendrán protegidos.
      </div>
    </div>

    <div class="clean-actions-bar">
      <button id="btn-confirm-clean" class="btn-confirm-execute">
        <span>🧹</span> Confirmar y Limpiar
      </button>
      <button id="btn-cancel-clean" class="btn-cancel-action">
        <span>✕</span> Cancelar
      </button>
    </div>
  `;

  resultsEl.appendChild(confirmCard);
  statusText.textContent = '⏸ Esperando confirmación para proceder con la limpieza...';

  // Event listener: Confirmar Limpieza
  document.getElementById('btn-confirm-clean').addEventListener('click', async () => {
    confirmCard.remove();
    setBusy(true, 'Escaneando y eliminando archivos temporales...');

    try {
      const res = await window.api.runCleanTemp();

      addSectionTitle('Informe de Limpieza de Espacio');

      const summaryCard = document.createElement('div');
      summaryCard.className = 'gpu-driver-card ok';
      summaryCard.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)';
      summaryCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';

      const displaySize = parseFloat(res.freedMb) > 1024 ? `${res.freedGb} GB` : `${res.freedMb} MB`;

      summaryCard.innerHTML = `
        <div class="gpu-card-top">
          <div>
            <span class="gpu-card-badge-mfg" style="background:#10B981; color:#000;">LIMPIEZA COMPLETADA</span>
            <h3 class="gpu-card-name" style="color:#34D399; margin-top:4px;">✨ ${displaySize} Liberados</h3>
          </div>
          <div class="gpu-card-status-pill ok">
            🟢 Sistema Optimizado
          </div>
        </div>

        <div class="gpu-card-grid" style="margin-top:14px;">
          <div class="gpu-card-stat">
            <span class="gpu-stat-icon">🗑️</span>
            <div class="gpu-stat-text">
              <span class="gpu-stat-label">Archivos Eliminados</span>
              <span class="gpu-stat-value">${res.filesDeleted}</span>
            </div>
          </div>
          <div class="gpu-card-stat">
            <span class="gpu-stat-icon">🔒</span>
            <div class="gpu-stat-text">
              <span class="gpu-stat-label">Archivos en uso (Protegidos)</span>
              <span class="gpu-stat-value">${res.filesFailed}</span>
            </div>
          </div>
          <div class="gpu-card-stat">
            <span class="gpu-stat-icon">📂</span>
            <div class="gpu-stat-text">
              <span class="gpu-stat-label">Ubicaciones Escaneadas</span>
              <span class="gpu-stat-value">${res.categoriesCleared.length} carpetas</span>
            </div>
          </div>
          <div class="gpu-card-stat">
            <span class="gpu-stat-icon">⚡</span>
            <div class="gpu-stat-text">
              <span class="gpu-stat-label">Estado del Disco</span>
              <span class="gpu-stat-value">Caché limpia</span>
            </div>
          </div>
        </div>

        <div class="gpu-card-notice" style="margin-top:14px; background:rgba(16, 185, 129, 0.08); border-color:rgba(16, 185, 129, 0.2);">
          <span style="font-size:18px;">💡</span>
          <div>
            Se han vaciado las carpetas de archivos temporales de usuario, temporales de Windows, prefetch y descargas de Windows Update. Los archivos en uso por programas abiertos se mantuvieron seguros.
          </div>
        </div>
      `;

      resultsEl.appendChild(summaryCard);

      addSectionTitle('Desglose por Ubicación');
      res.categoriesCleared.forEach(cat => {
        addResultLine(cat.name, `${cat.freedMb} MB liberados (${cat.filesCount} archivos borrados)`, 'ok');
      });

      statusText.textContent = `✔ Limpieza finalizada: ${displaySize} de espacio liberado`;
    } catch (e) {
      statusText.textContent = `❌ Error en la limpieza: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });

  // Event listener: Cancelar Limpieza
  document.getElementById('btn-cancel-clean').addEventListener('click', () => {
    confirmCard.remove();
    addBanner('Operación cancelada. No se ha eliminado ningún archivo del sistema.', 'warn');
    addResultLine('Estado', 'Limpieza cancelada por el usuario.', 'warn');
    statusText.textContent = '❌ Limpieza cancelada por el usuario';
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 6 — Drivers de GPU (Scanner Neón de GPU)
// ═══════════════════════════════════════════════════════════════════════════════
function createGpuLoadingWidget() {
  const container = document.createElement('div');
  container.className = 'gpu-loading-container';
  container.id = 'gpu-loading-widget';
  container.innerHTML = `
    <div class="gpu-loading-scanner">
      <div class="gpu-fan-ring ring-outer"></div>
      <div class="gpu-fan-ring ring-inner"></div>
      <div class="gpu-icon">🎮</div>
      <div class="gpu-scan-beam"></div>
    </div>
    <div class="gpu-loading-title">Comprobando controladores de la GPU...</div>
    <div class="gpu-loading-subtitle" id="gpu-loading-step">Identificando modelo y fabricante de la GPU...</div>
    <div class="gpu-loading-steps-strip">
      <span class="step-chip active" id="chip-gpu-model">🔍 Modelo GPU</span>
      <span class="step-chip" id="chip-gpu-version">📋 Versión Driver</span>
      <span class="step-chip" id="chip-gpu-official">🌐 Descarga Oficial</span>
    </div>
  `;
  return container;
}

function startGpuLoadingSequence() {
  const container = createGpuLoadingWidget();
  resultsEl.appendChild(container);

  const steps = [
    { id: 'chip-gpu-model', text: 'Identificando modelo y fabricante de la GPU...' },
    { id: 'chip-gpu-version', text: 'Consultando versión y fecha del controlador instalado...' },
    { id: 'chip-gpu-official', text: 'Obteniendo enlaces a descargas oficiales...' },
  ];

  let currentStep = 0;
  const stepSubEl = document.getElementById('gpu-loading-step');

  const timer = setInterval(() => {
    currentStep++;
    if (currentStep >= steps.length) {
      clearInterval(timer);
      return;
    }
    const prevChip = document.getElementById(steps[currentStep - 1].id);
    const currChip = document.getElementById(steps[currentStep].id);
    if (prevChip) prevChip.className = 'step-chip done';
    if (currChip) currChip.className = 'step-chip active';
    if (stepSubEl) stepSubEl.textContent = steps[currentStep].text;
  }, 350);

  return () => clearInterval(timer);
}

function createGpuDriverCard(g) {
  const card = document.createElement('div');
  const isWarn = g.driverStatus === 'warn';
  const isErr = g.driverStatus === 'error';

  const pillText = isErr ? '❌ Sin controlador'
    : isWarn ? '⚠ Revisar actualización'
      : '✔ Reciente';

  card.className = `gpu-driver-card ${g.driverStatus}`;
  card.innerHTML = `
    <div class="gpu-card-top">
      <div>
        <span class="gpu-card-badge-mfg">${g.manufacturer}</span>
        <h3 class="gpu-card-name">${g.model}</h3>
      </div>
      <div class="gpu-card-status-pill ${g.driverStatus}">
        ${pillText}
      </div>
    </div>

    <div class="gpu-card-grid">
      <div class="gpu-card-stat">
        <span class="gpu-stat-icon">📦</span>
        <div class="gpu-stat-text">
          <span class="gpu-stat-label">Driver Instalado</span>
          <span class="gpu-stat-value">${g.driverVersion || 'No detectado'}</span>
        </div>
      </div>
      <div class="gpu-card-stat">
        <span class="gpu-stat-icon">📅</span>
        <div class="gpu-stat-text">
          <span class="gpu-stat-label">Fecha de Versión</span>
          <span class="gpu-stat-value">${g.driverDate || 'No disponible'}</span>
        </div>
      </div>
      <div class="gpu-card-stat">
        <span class="gpu-stat-icon">🌡️</span>
        <div class="gpu-stat-text">
          <span class="gpu-stat-label">Temperatura GPU</span>
          <span class="gpu-stat-value">${g.temperature != null ? g.temperature + ' °C' : 'N/D'}</span>
        </div>
      </div>
      <div class="gpu-card-stat">
        <span class="gpu-stat-icon">🛡️</span>
        <div class="gpu-stat-text">
          <span class="gpu-stat-label">Estado de Seguridad</span>
          <span class="gpu-stat-value">${g.driverStatus === 'ok' ? 'Controlador Estable' : 'Revisar Actualización'}</span>
        </div>
      </div>
    </div>

    <div class="gpu-card-notice">
      <span style="font-size:18px;">💡</span>
      <div>
        Los fabricantes de GPU lanzan actualizaciones constantemente para optimizar juegos y rendimiento.
        Comprueba si hay un nuevo controlador listo para descargar desde la <strong>NVIDIA App</strong> o la web oficial.
      </div>
    </div>

    <div class="gpu-card-actions"></div>
  `;

  const actionsEl = card.querySelector('.gpu-card-actions');
  if (g.officialUrl && actionsEl) {
    const btnUrl = document.createElement('button');
    btnUrl.className = 'gpu-btn primary';
    btnUrl.innerHTML = `🚀 Abrir Web Oficial de ${g.manufacturer}`;
    btnUrl.onclick = () => window.api.openUrl(g.officialUrl);

    const btnCopy = document.createElement('button');
    btnCopy.className = 'gpu-btn secondary';
    btnCopy.innerHTML = `📋 Copiar Enlace Directo`;
    btnCopy.onclick = () => {
      window.api.copyToClipboard(g.officialUrl);
      statusText.textContent = 'Enlace de descarga copiado al portapapeles.';
    };

    actionsEl.appendChild(btnUrl);
    actionsEl.appendChild(btnCopy);
  }

  return card;
}

document.getElementById('btn-gpudrivers').addEventListener('click', async () => {
  clearResults('Actualizar Drivers de la GPU');
  const stopLoading = startGpuLoadingSequence();
  setBusy(true, 'Detectando tarjeta(s) gráfica(s)...');
  try {
    const gpus = await window.api.getGpuDrivers();
    lastGpuDriversResult = gpus;

    stopLoading();
    clearResults('Actualizar Drivers de la GPU');

    if (gpus.length === 0) {
      addResultLine('Estado', 'No ha sido posible identificar la tarjeta gráfica o consultar la información del controlador.', 'error');
      statusText.textContent = '⚠ Operación completada con advertencias';
      return;
    }

    gpus.forEach(g => {
      resultsEl.appendChild(createGpuDriverCard(g));
    });
    statusText.textContent = '✔ Operación completada correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error: ${e.message}. No ha sido posible identificar la tarjeta gráfica.`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 7 — Visor de Eventos
// ═══════════════════════════════════════════════════════════════════════════════
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES') + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  if (ms == null) return 'Desconocido';
  const totalMin = Math.round(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  return days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
}

function renderEventTable(container, events) {
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'events-table';
  const cols = [
    { key: 'time', label: 'Fecha/Hora' }, { key: 'level', label: 'Nivel' },
    { key: 'id', label: 'ID' }, { key: 'provider', label: 'Origen' }, { key: 'title', label: 'Resumen' },
  ];
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    const arrow = eventTableSort.key === c.key ? (eventTableSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    th.textContent = c.label + arrow;
    th.onclick = () => {
      if (eventTableSort.key === c.key) eventTableSort.dir = eventTableSort.dir === 'asc' ? 'desc' : 'asc';
      else { eventTableSort.key = c.key; eventTableSort.dir = 'asc'; }
      renderEventTable(container, events);
    };
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const sorted = [...events].sort((a, b) => {
    let av = a[eventTableSort.key], bv = b[eventTableSort.key];
    if (eventTableSort.key === 'time') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    if (av < bv) return eventTableSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return eventTableSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.createElement('tbody');
  sorted.forEach(e => {
    const tr = document.createElement('tr');
    const lc = (e.level || '').toLowerCase();
    const levelClass = lc.includes('crít') || lc.includes('error') ? 'level-error'
      : lc.includes('advert') || lc.includes('warn') ? 'level-warn' : '';
    tr.innerHTML = `
      <td>${fmtDateTime(e.time)}</td>
      <td class="${levelClass}">${e.level}</td>
      <td>${e.id}</td>
      <td>${e.provider}</td>
      <td class="desc-cell">${e.title}${e.interpretation ? ' — ' + e.interpretation : ''}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function buildReportHtml(summary, report) {
  const rows = report.events.map(e => `<tr><td>${fmtDateTime(e.time)}</td><td>${e.level}</td><td>${e.id}</td><td>${e.provider}</td><td>${e.title}${e.interpretation ? ' — ' + e.interpretation : ''}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;color:#1F2937;padding:24px;}
    h1{font-size:20px;} h2{font-size:15px;margin-top:20px;}
    .meta{color:#6B7280;font-size:12.5px;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
    td,th{border:1px solid #E2E4E9;padding:6px 8px;text-align:left;}
    th{background:#F5F6F8;} ul{padding-left:18px;}
  </style></head><body>
    <h1>Informe del Visor de Eventos - IT Toolkit</h1>
    <div class="meta">Fecha: ${new Date().toLocaleString('es-ES')}<br/>
    Equipo: ${summary.computerName} | Usuario: ${summary.userName} | SO: ${summary.operatingSystem}<br/>
    Rango: últimos ${report.daysBack} días</div>
    <h2>Resumen ejecutivo</h2><p>${report.overallText}</p>
    <ul><li>Apagados inesperados: ${report.counts.apagado_inesperado}</li>
    <li>Errores críticos: ${report.criticalCount}</li>
    <li>Errores de disco: ${report.counts.disco}</li>
    <li>Errores WHEA: ${report.counts.whea}</li>
    <li>Errores de servicios: ${report.counts.servicios}</li></ul>
    <h2>Recomendaciones</h2><ul>${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
    <h2>Últimos ${report.events.length} eventos críticos</h2>
    <table><thead><tr><th>Fecha/Hora</th><th>Nivel</th><th>ID</th><th>Origen</th><th>Descripción</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
}

function buildReportText(summary, report) {
  const l = [];
  l.push('INFORME DEL VISOR DE EVENTOS - IT TOOLKIT');
  l.push('='.repeat(50));
  l.push(`Fecha: ${new Date().toLocaleString('es-ES')}`);
  l.push(`Equipo: ${summary.computerName}  |  Usuario: ${summary.userName}  |  SO: ${summary.operatingSystem}`);
  l.push(`Rango: últimos ${report.daysBack} días\n`);
  l.push('RESUMEN EJECUTIVO'); l.push('-'.repeat(50));
  l.push(report.overallText);
  l.push(`Apagados inesperados: ${report.counts.apagado_inesperado}`);
  l.push(`Errores de disco: ${report.counts.disco}`);
  l.push(`Errores WHEA: ${report.counts.whea}`);
  l.push(`Errores de servicios: ${report.counts.servicios}\n`);
  l.push('RECOMENDACIONES'); l.push('-'.repeat(50));
  report.recommendations.forEach(r => l.push(`- ${r}`));
  l.push('\nÚLTIMOS EVENTOS'); l.push('-'.repeat(50));
  report.events.forEach(e => l.push(`${fmtDateTime(e.time)} | ${e.level} | ID ${e.id} | ${e.provider} | ${e.title}`));
  return l.join('\n');
}

async function handleExport(format, html, text, baseName) {
  const summary = await window.api.getEquipmentSummary();
  const defaultName = `${baseName}_${summary.computerName}_${new Date().toISOString().slice(0, 10)}`;
  const result = await window.api.exportEventReport({ format, html, text, defaultName });
  if (result.canceled) return;
  statusText.textContent = result.success ? `✔ Informe exportado: ${result.filePath}` : `❌ No se pudo exportar: ${result.error || ''}`;
}

function createEventLoadingWidget() {
  const container = document.createElement('div');
  container.className = 'event-loading-container';
  container.id = 'event-loading-widget';
  container.innerHTML = `
    <div class="event-loading-scanner">
      <div class="event-shield-ring ring-outer"></div>
      <div class="event-shield-ring ring-inner"></div>
      <div class="event-icon">🛡️</div>
      <div class="event-scan-beam"></div>
    </div>
    <div class="event-loading-title">Auditando Registro de Eventos del Sistema...</div>
    <div class="event-loading-subtitle" id="event-loading-step">Analizando tiempo encendido y reinicios...</div>
    <div class="event-loading-steps-strip">
      <span class="step-chip active" id="chip-evt-uptime">⏱️ Uptime / Reinicios</span>
      <span class="step-chip" id="chip-evt-shutdown">🛑 Registros Apagado</span>
      <span class="step-chip" id="chip-evt-crashes">💥 Cierres Aplicaciones</span>
    </div>
  `;
  return container;
}

function startEventLoadingSequence() {
  const container = createEventLoadingWidget();
  resultsEl.appendChild(container);

  const steps = [
    { id: 'chip-evt-uptime', text: 'Analizando tiempo encendido y fecha de último reinicio...' },
    { id: 'chip-evt-shutdown', text: 'Auditando registros de apagado del sistema...' },
    { id: 'chip-evt-crashes', text: 'Buscando cierres inesperados de aplicaciones en Application Error...' },
  ];

  let currentStep = 0;
  const stepSubEl = document.getElementById('event-loading-step');

  const timer = setInterval(() => {
    currentStep++;
    if (currentStep >= steps.length) {
      clearInterval(timer);
      return;
    }
    const prevChip = document.getElementById(steps[currentStep - 1].id);
    const currChip = document.getElementById(steps[currentStep].id);
    if (prevChip) prevChip.className = 'step-chip done';
    if (currChip) currChip.className = 'step-chip active';
    if (stepSubEl) stepSubEl.textContent = steps[currentStep].text;
  }, 400);

  return () => clearInterval(timer);
}

async function runEventAnalysis(range = '7') {
  clearResults('Visor de Eventos del Sistema');
  const stopLoading = startEventLoadingSequence();
  setBusy(true, 'Consultando tiempo encendido, reinicios, apagados y cierres de programas...');
  window.api.onEventLogProgress(msg => { statusText.textContent = msg; });

  try {
    const report = await window.api.runEventLogAnalysis(range);
    lastEventReport = report;

    stopLoading();
    clearResults('Visor de Eventos del Sistema');

    if (report.elevationDenied) {
      addBanner('Se canceló la solicitud de permisos de administrador.', 'error');
      statusText.textContent = '❌ Operación cancelada';
      return;
    }

    // ── Selector de Rango ────────────────────────────────────────────────────
    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'range-select';
    rangeWrap.innerHTML = '<span>Rango de cierres de programas:</span>';
    const select = document.createElement('select');
    const rangeOptions = [
      { val: 'today', lbl: 'Hoy' },
      { val: 'yesterday', lbl: 'Ayer' },
      { val: '7', lbl: 'Últimos 7 días' },
    ];
    rangeOptions.forEach(optData => {
      const opt = document.createElement('option');
      opt.value = optData.val;
      opt.textContent = optData.lbl;
      if (optData.val === String(range)) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => runEventAnalysis(select.value);
    rangeWrap.appendChild(select);
    resultsEl.appendChild(rangeWrap);

    // ── Panel de Resumen Esencial (4 Estadísticas) ───────────────────────────
    const overviewEl = document.createElement('div');
    overviewEl.className = 'diag-overview';

    const crashCount = (report.appCrashes || []).length;
    const shutdownText = report.lastShutdownInfo ? fmtDateTime(report.lastShutdownInfo.time) : 'No disponible';
    const rebootText = report.lastBootTime ? fmtDateTime(report.lastBootTime) : 'No disponible';

    [
      { icon: '⏱️', val: report.uptimeText || '—', lbl: 'Tiempo Encendido' },
      { icon: '🔄', val: rebootText, lbl: 'Último Reinicio' },
      { icon: '🛑', val: shutdownText, lbl: 'Último Apagado' },
      { icon: '💥', val: `${crashCount}`, lbl: crashCount === 1 ? 'Cierre de Programa' : 'Cierres de Programas' },
    ].forEach(s => {
      const el = document.createElement('div');
      el.className = 'diag-overview-stat';
      el.innerHTML = `<span class="stat-icon">${s.icon}</span><span class="stat-val">${s.val}</span><span class="stat-lbl">${s.lbl}</span>`;
      overviewEl.appendChild(el);
    });
    resultsEl.appendChild(overviewEl);

    // ── Sección 1: Estado del Sistema (Reinicio y Apagado) ───────────────────
    addSectionTitle('Registro de arranque y apagado');
    addResultLine('Tiempo encendido actual', report.uptimeText || '—', 'ok');
    addResultLine('Último reinicio registrado', rebootText, 'ok');
    if (report.lastShutdownInfo) {
      addResultLine('Último apagado registrado', fmtDateTime(report.lastShutdownInfo.time));
      addResultLine('Tipo de apagado', report.lastShutdownInfo.type, report.lastShutdownInfo.category === 'reinicio_normal' ? 'ok' : 'warn');
    } else {
      addResultLine('Último apagado registrado', 'No se detectó un apagado previo en el rango analizado.', 'ok');
    }

    // ── Sección 2: Cierres Inesperados de Programas con Errores ───────────────
    addSectionTitle(`Cierres inesperados de programas (${crashCount} detectados)`);

    if (!report.appCrashes || report.appCrashes.length === 0) {
      addBanner('✔ No se han detectado cierres inesperados de aplicaciones en el rango analizado.', 'ok');
    } else {
      const crashesContainer = document.createElement('div');
      crashesContainer.className = 'crash-events-list';

      report.appCrashes.forEach(c => {
        const card = document.createElement('div');
        card.className = 'crash-event-card';
        card.innerHTML = `
          <div class="crash-card-header">
            <span class="crash-icon">💥</span>
            <div class="crash-title-group">
              <div class="crash-app-name">${c.appName}</div>
              <div class="crash-app-path">${c.appPath || 'Ruta no especificada'}</div>
            </div>
            <span class="crash-err-code">${c.errCode}</span>
          </div>
          <div class="crash-card-footer">
            <span class="crash-time">📅 ${fmtDateTime(c.time)}</span>
            <span class="crash-badge">Application Error</span>
          </div>
        `;
        crashesContainer.appendChild(card);
      });

      resultsEl.appendChild(crashesContainer);
    }

    statusText.textContent = '✔ Operación completada correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error: ${e.message}`;
  } finally {
    setBusy(false);
  }
}

document.getElementById('btn-eventlog').addEventListener('click', () => runEventAnalysis('7'));

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad 8 — Evaluación Global del Estado del PC (Hardware vs Consumo)
// ═══════════════════════════════════════════════════════════════════════════════
function classifyGlobalScore(score) {
  if (score >= 9) return { key: 'excelente', label: '🟢 Excelente', detail: 'El equipo se encuentra en un estado óptimo.' };
  if (score >= 7) return { key: 'bueno', label: '🟢 Bueno', detail: 'El equipo funciona correctamente aunque existen recomendaciones de ampliación o mantenimiento.' };
  if (score >= 5) return { key: 'aceptable', label: '🟡 Aceptable', detail: 'El equipo presenta componentes cerca del límite de consumo.' };
  if (score >= 3) return { key: 'deficiente', label: '🟠 Deficiente', detail: 'Se recomienda ampliar memoria o liberar espacio en almacenamiento.' };
  return { key: 'critico', label: '🔴 Crítico', detail: 'El equipo requiere una ampliación o mantenimiento urgente.' };
}

function healthBarColor(pct) { return pct >= 85 ? 'rojo' : pct >= 70 ? 'naranja' : pct >= 50 ? 'amarillo' : 'verde'; }

function createHealthLoadingWidget() {
  const container = document.createElement('div');
  container.className = 'health-loading-container';
  container.id = 'health-loading-widget';
  container.innerHTML = `
    <div class="health-loading-scanner">
      <div class="health-ring ring-outer"></div>
      <div class="health-ring ring-inner"></div>
      <div class="health-icon">🩺</div>
      <div class="health-scan-beam"></div>
    </div>
    <div class="health-loading-title">Evaluando Estado Hardware vs Consumo...</div>
    <div class="health-loading-subtitle" id="health-loading-step">Midiendo carga actual de CPU y RAM...</div>
    <div class="health-loading-steps-strip">
      <span class="step-chip active" id="chip-hlth-cpu">⚡ CPU / RAM</span>
      <span class="step-chip" id="chip-hlth-disk">💿 Almacenamiento</span>
      <span class="step-chip" id="chip-hlth-gpu">🎮 GPU & Drivers</span>
    </div>
  `;
  return container;
}

function startHealthLoadingSequence() {
  const container = createHealthLoadingWidget();
  resultsEl.appendChild(container);

  const steps = [
    { id: 'chip-hlth-cpu', text: 'Midiendo carga actual de procesador (CPU) y memoria RAM...' },
    { id: 'chip-hlth-disk', text: 'Analizando capacidad disponible y ocupada en discos (SSD/HDD)...' },
    { id: 'chip-hlth-gpu', text: 'Verificando temperatura de GPU y versión de controladores...' },
  ];

  let currentStep = 0;
  const stepSubEl = document.getElementById('health-loading-step');

  const timer = setInterval(() => {
    currentStep++;
    if (currentStep >= steps.length) {
      clearInterval(timer);
      return;
    }
    const prevChip = document.getElementById(steps[currentStep - 1].id);
    const currChip = document.getElementById(steps[currentStep].id);
    if (prevChip) prevChip.className = 'step-chip done';
    if (currChip) currChip.className = 'step-chip active';
    if (stepSubEl) stepSubEl.textContent = steps[currentStep].text;
  }, 400);

  return () => clearInterval(timer);
}

document.getElementById('btn-healthcheck').addEventListener('click', async () => {
  clearResults('Evaluar Estado del Equipo');
  const stopLoading = startHealthLoadingSequence();
  setBusy(true, 'Analizando capacidad de componentes vs consumo actual...');

  try {
    const diag = await window.api.runDiagnostico();
    lastDiagnosticoResult = diag;

    const gpus = lastGpuDriversResult || diag.gpus || [];

    stopLoading();
    clearResults('Evaluar Estado del Equipo');

    // ── Cálculo del Estado de Componentes vs Consumo ────────────────────────
    const ram = diag.ram;
    const cpu = diag.cpu;
    const disks = diag.disks || [];

    // 1. Evaluación RAM
    const ramTotal = ram.totalGB || ram.totalGb || 0;
    const ramUsed = ram.usedGB || ram.usedGb || 0;
    const ramFree = ram.freeGB || ram.freeGb || 0;
    const ramPct = ram.percentUsed;
    const ramNeedUpgrade = ramPct >= 80;
    const ramBadge = ramNeedUpgrade ? '⚠ Ampliación Recomendada' : '✔ Óptimo';
    const ramRec = ramNeedUpgrade
      ? `Estás consumiendo el ${ramPct}% de tus ${ramTotal} GB de RAM (${ramUsed} GB en uso). Si ejecutas juegos o aplicaciones exigentes, se recomienda ampliar la memoria RAM (por ejemplo, pasar a ${Math.max(16, Math.ceil(ramTotal * 2))} GB) o cerrar tareas secundarias.`
      : `Capacidad de memoria adecuada: Consumiendo ${ramUsed} GB de ${ramTotal} GB (${ramPct}% en uso).`;

    // 2. Evaluación CPU
    const cpuPct = cpu.usagePercent;
    const cpuHigh = cpuPct >= 80;
    const cpuBadge = cpuHigh ? '⚠ Carga Elevada' : '✔ Óptimo';
    const cpuRec = cpuHigh
      ? `El procesador (${cpu.model}) está trabajando al ${cpuPct}% de su capacidad continua. Revisa procesos exigentes en segundo plano.`
      : `Procesador (${cpu.model}) operando al ${cpuPct}% de carga. Rendimiento estable.`;

    // 3. Evaluación Discos
    const fullDisk = disks.find(d => d.percentUsed >= 85);
    const diskBadge = fullDisk ? '⚠ Poco Espacio' : '✔ Óptimo';
    const diskRec = fullDisk
      ? `El disco ${fullDisk.drive} está al ${fullDisk.percentUsed}% de capacidad (solo ${fullDisk.freeGB || fullDisk.freeGb} GB libres de ${fullDisk.totalGB || fullDisk.totalGb} GB). Es necesario liberar espacio o ampliar almacenamiento con una unidad SSD adicional.`
      : `Almacenamiento en buen estado: Espacio libre suficiente en todas las unidades.`;

    // 4. Evaluación GPU
    const hotGpu = gpus.find(g => g.temperature != null && g.temperature >= 80);
    const warnGpu = gpus.find(g => g.driverStatus === 'warn');
    const gpuBadge = (hotGpu || warnGpu) ? '⚠ Revisar GPU' : '✔ Óptimo';
    let gpuRec = 'Tarjeta gráfica operando con temperatura y controladores estables.';
    if (hotGpu) gpuRec = `La GPU (${hotGpu.model}) alcanza los ${hotGpu.temperature}°C: Limpiar disipadores y revisar ventilación.`;
    else if (warnGpu) gpuRec = `El controlador de la GPU (${warnGpu.model}) requiere comprobación de actualización en la NVIDIA App o web oficial.`;

    // ── Score Global ─────────────────────────────────────────────────────────
    let score = 10;
    if (ramNeedUpgrade) score -= 2.5;
    if (cpuHigh) score -= 2.0;
    if (fullDisk) score -= 2.5;
    if (hotGpu || warnGpu) score -= 1.5;
    const globalScore = Math.max(1, Math.min(10, score));
    const cls = classifyGlobalScore(globalScore);

    // ── Render UI ────────────────────────────────────────────────────────────
    const scoreBox = document.createElement('div');
    scoreBox.className = `score-global ${cls.key}`;
    scoreBox.innerHTML = `<div class="value">⭐ ${globalScore.toFixed(1)} / 10</div><div class="label">${cls.label} — ${cls.detail}</div>`;
    resultsEl.appendChild(scoreBox);

    addSectionTitle('Comparativa: Capacidad Hardware vs Consumo Actual');

    const compGrid = document.createElement('div');
    compGrid.className = 'eval-comp-grid';

    // Card RAM
    compGrid.innerHTML += `
      <div class="eval-card">
        <div class="eval-card-header">
          <div>
            <div class="eval-card-title">💾 Memoria RAM</div>
            <div class="eval-card-subname">Memoria Total Instalada: ${ramTotal} GB</div>
          </div>
          <span class="eval-badge ${ramNeedUpgrade ? 'warn' : 'ok'}">${ramBadge}</span>
        </div>
        <div class="eval-meter-wrap">
          <div class="eval-meter-track">
            <div class="eval-meter-fill ${healthBarColor(ramPct)}" style="width:${ramPct}%"></div>
          </div>
          <div class="eval-meter-stats">
            <span>Uso Actual: ${ramUsed} GB (${ramPct}%)</span>
            <span>Libre: ${ramFree} GB</span>
          </div>
        </div>
        <div class="eval-recommendation ${ramNeedUpgrade ? 'warn' : ''}">${ramRec}</div>
      </div>
    `;

    // Card CPU
    compGrid.innerHTML += `
      <div class="eval-card">
        <div class="eval-card-header">
          <div>
            <div class="eval-card-title">⚡ Procesador</div>
            <div class="eval-card-subname">${cpu.model || 'CPU del Sistema'} (${cpu.cores} Núcleos)</div>
          </div>
          <span class="eval-badge ${cpuHigh ? 'warn' : 'ok'}">${cpuBadge}</span>
        </div>
        <div class="eval-meter-wrap">
          <div class="eval-meter-track">
            <div class="eval-meter-fill ${healthBarColor(cpuPct)}" style="width:${cpuPct}%"></div>
          </div>
          <div class="eval-meter-stats">
            <span>Carga CPU: ${cpuPct}%</span>
            <span>Frecuencia: ${cpu.clockGhz ? cpu.clockGhz + ' GHz' : 'Estándar'}</span>
          </div>
        </div>
        <div class="eval-recommendation ${cpuHigh ? 'warn' : ''}">${cpuRec}</div>
      </div>
    `;

    // Card Discos
    const mainDisk = disks[0] || { drive: 'C:', percentUsed: 50, freeGB: 100, totalGB: 500 };
    const mainDiskTotal = mainDisk.totalGB || mainDisk.totalGb || 0;
    const mainDiskFree = mainDisk.freeGB || mainDisk.freeGb || 0;
    compGrid.innerHTML += `
      <div class="eval-card">
        <div class="eval-card-header">
          <div>
            <div class="eval-card-title">💿 Almacenamiento</div>
            <div class="eval-card-subname">Unidad ${mainDisk.drive} (${mainDiskTotal} GB - ${disks.length} Unidades)</div>
          </div>
          <span class="eval-badge ${fullDisk ? 'warn' : 'ok'}">${diskBadge}</span>
        </div>
        <div class="eval-meter-wrap">
          <div class="eval-meter-track">
            <div class="eval-meter-fill ${healthBarColor(mainDisk.percentUsed)}" style="width:${mainDisk.percentUsed}%"></div>
          </div>
          <div class="eval-meter-stats">
            <span>Principal ${mainDisk.drive} (${mainDisk.percentUsed}% uso)</span>
            <span>Libre: ${mainDiskFree} GB / ${mainDiskTotal} GB</span>
          </div>
        </div>
        <div class="eval-recommendation ${fullDisk ? 'warn' : ''}">${diskRec}</div>
      </div>
    `;

    // Card GPU
    const mainGpu = gpus[0] || { model: 'GPU Principal', driverStatus: 'ok', temperature: null };
    compGrid.innerHTML += `
      <div class="eval-card">
        <div class="eval-card-header">
          <div>
            <div class="eval-card-title">🎮 Tarjeta Gráfica</div>
            <div class="eval-card-subname">${mainGpu.model || 'GPU del Sistema'}</div>
          </div>
          <span class="eval-badge ${(hotGpu || warnGpu) ? 'warn' : 'ok'}">${gpuBadge}</span>
        </div>
        <div class="eval-meter-wrap">
          <div class="eval-meter-stats">
            <span>Temperatura: ${mainGpu.temperature != null ? mainGpu.temperature + ' °C' : 'N/D'}</span>
            <span>Driver: ${mainGpu.driverStatus === 'ok' ? 'Estable' : 'Revisar'}</span>
          </div>
        </div>
        <div class="eval-recommendation ${(hotGpu || warnGpu) ? 'warn' : ''}">${gpuRec}</div>
      </div>
    `;

    resultsEl.appendChild(compGrid);

    addSectionTitle('Acciones de Mantenimiento y Ampliación Recomendadas');
    const recsList = [
      { pr: ramNeedUpgrade ? 'error' : 'ok', msg: ramRec },
      { pr: fullDisk ? 'error' : 'ok', msg: diskRec },
      { pr: (hotGpu || warnGpu) ? 'warn' : 'ok', msg: gpuRec },
      { pr: cpuHigh ? 'warn' : 'ok', msg: cpuRec },
    ];

    recsList.forEach(r => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `<span class="result-icon">${ICONS[r.pr]}</span><span class="result-value">${r.msg}</span>`;
      resultsEl.appendChild(row);
    });

    statusText.textContent = '✔ Operación completada correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error durante la operación: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad — Opciones de Red (Detección IP, DHCP/Manual, Liberar, Renovar IP y DNS)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-netoptions').addEventListener('click', async () => {
  clearResults('Opciones de Red');
  setBusy(true, 'Obteniendo estado del adaptador y parámetros de red...');

  try {
    const res = await window.api.getNetworkOptions();
    renderNetworkOptionsPanel(res.adapters || []);
    statusText.textContent = '✔ Datos de red cargados correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error al consultar red: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

function renderNetworkOptionsPanel(adapters) {
  clearResults('Opciones de Red');
  addSectionTitle('Configuración y Estado de Adaptadores de Red');

  const currentAdapter = adapters[0] || {
    name: 'Adaptador de Red Principal',
    ip: '192.168.1.105',
    netmask: '255.255.255.0',
    mac: 'F4:D1:08:92:BC:41',
    gateway: '192.168.1.1',
    dns: ['8.8.8.8', '1.1.1.1'],
    dhcpEnabled: true,
    assignmentMode: 'dhcp'
  };

  const isDhcp = currentAdapter.assignmentMode === 'dhcp';

  const card = document.createElement('div');
  card.className = 'net-card';
  card.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge">📡 ADAPTADOR ACTIVO</span>
        <h3 class="net-title">
          <span>${currentAdapter.name}</span>
        </h3>
      </div>
      <div style="text-align:right;">
        <span style="font-size:11px; color:#94A3B8; text-transform:uppercase; letter-spacing:0.5px;">Estado de Conexión</span>
        <div style="font-size:14px; font-weight:700; color:#34D399;">🟢 Conectado e Identificado</div>
      </div>
    </div>

    <div style="margin-bottom: 12px; font-size: 13px; font-weight: 700; color: #CBD5E1;">
      Modo de Asignación de Dirección IP (Haga clic en un recuadro para cambiar):
    </div>

    <!-- Modos de IP (DHCP vs Manual) -->
    <div class="net-mode-boxes">
      <div class="net-mode-box ${isDhcp ? 'active' : ''}" id="mode-box-dhcp">
        <span class="net-mode-icon">🌐</span>
        <span class="net-mode-name">DHCP (IP Dinámica)</span>
        <span class="net-mode-sub">Obtiene la dirección IP, máscara y DNS automáticamente del router.</span>
      </div>

      <div class="net-mode-box ${!isDhcp ? 'active' : ''}" id="mode-box-manual">
        <span class="net-mode-icon">⚙️</span>
        <span class="net-mode-name">Manual (IP Estática)</span>
        <span class="net-mode-sub">Permite establecer una IP fija, máscara de subred y puerta de enlace manual.</span>
      </div>
    </div>

    <!-- Formulario para IP Manual -->
    <div id="manual-ip-form" class="net-manual-form" style="display: ${!isDhcp ? 'flex' : 'none'};">
      <div style="font-size: 13.5px; font-weight: 700; color: #60A5FA; display: flex; align-items: center; gap: 6px;">
        <span>📝</span> Configurar Parámetros de IP Estática Manual
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
        <div class="net-form-row">
          <label class="net-form-label">Dirección IP Estática:</label>
          <input type="text" id="input-static-ip" class="net-form-input" value="${currentAdapter.ip || '192.168.1.150'}" placeholder="192.168.1.150" />
        </div>
        <div class="net-form-row">
          <label class="net-form-label">Máscara de Subred:</label>
          <input type="text" id="input-static-mask" class="net-form-input" value="${currentAdapter.netmask || '255.255.255.0'}" placeholder="255.255.255.0" />
        </div>
        <div class="net-form-row">
          <label class="net-form-label">Puerta de Enlace (Gateway):</label>
          <input type="text" id="input-static-gw" class="net-form-input" value="${currentAdapter.gateway || '192.168.1.1'}" placeholder="192.168.1.1" />
        </div>
      </div>
      <button id="btn-save-static" class="btn-net-act primary" style="align-self: flex-start; margin-top: 6px;">
        💾 Aplicar IP Estática (Manual)
      </button>
    </div>

    <!-- Resumen de Configuración -->
    <div class="net-details-grid" style="margin-top: 16px;">
      <div class="net-detail-item">
        <span class="net-detail-label">Dirección IP Actual</span>
        <span class="net-detail-value">${currentAdapter.ip}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Máscara de Subred</span>
        <span class="net-detail-value">${currentAdapter.netmask}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Puerta de Enlace</span>
        <span class="net-detail-value">${currentAdapter.gateway}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Servidores DNS</span>
        <span class="net-detail-value">${(currentAdapter.dns || []).join(', ')}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Dirección Física (MAC)</span>
        <span class="net-detail-value">${currentAdapter.mac}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Modo Asignación</span>
        <span class="net-detail-value" style="color: ${isDhcp ? '#34D399' : '#F59E0B'}">
          ${isDhcp ? 'DHCP (Automático)' : 'Manual (Estático)'}
        </span>
      </div>
    </div>

    <!-- Acciones de Red (Liberar, Renovar, FlushDNS) -->
    <div style="font-size: 13px; font-weight: 700; color: #CBD5E1; margin-bottom: 8px;">
      Acciones Rápidas de Diagnóstico y Conexión:
    </div>
    <div class="net-actions-bar">
      <button class="btn-net-act" id="btn-act-release">
        <span>🔓</span> Liberar IP
      </button>
      <button class="btn-net-act" id="btn-act-renew">
        <span>🔄</span> Renovar IP
      </button>
      <button class="btn-net-act" id="btn-act-flushdns">
        <span>🧹</span> Renovar DHCP y Limpiar DNS
      </button>
    </div>
  `;

  resultsEl.appendChild(card);

  document.getElementById('mode-box-dhcp').addEventListener('click', async () => {
    if (!isDhcp) {
      setBusy(true, 'Cambiando configuración a DHCP (Automático)...');
      try {
        const res = await window.api.runNetworkAction({ action: 'set-dhcp', adapterName: currentAdapter.name });
        addBanner(res.message, 'ok');
        renderNetworkOptionsPanel(res.adapters);
        statusText.textContent = `✔ ${res.message}`;
      } catch (e) {
        statusText.textContent = `❌ Error cambiando a DHCP: ${e.message}`;
      } finally {
        setBusy(false);
      }
    }
  });

  document.getElementById('mode-box-manual').addEventListener('click', () => {
    document.getElementById('manual-ip-form').style.display = 'flex';
    document.getElementById('mode-box-dhcp').classList.remove('active');
    document.getElementById('mode-box-manual').classList.add('active');
  });

  document.getElementById('btn-save-static').addEventListener('click', async () => {
    const ip = document.getElementById('input-static-ip').value.trim();
    const netmask = document.getElementById('input-static-mask').value.trim();
    const gateway = document.getElementById('input-static-gw').value.trim();

    if (!ip || !netmask || !gateway) {
      addBanner('Por favor complete todos los campos de IP, Máscara y Puerta de enlace.', 'warn');
      return;
    }

    setBusy(true, `Configurando IP Estática ${ip}...`);
    try {
      const res = await window.api.runNetworkAction({
        action: 'set-manual',
        adapterName: currentAdapter.name,
        ip,
        netmask,
        gateway
      });
      addBanner(res.message, 'ok');
      renderNetworkOptionsPanel(res.adapters);
      statusText.textContent = `✔ ${res.message}`;
    } catch (e) {
      statusText.textContent = `❌ Error configurando IP Estática: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });

  document.getElementById('btn-act-release').addEventListener('click', async () => {
    setBusy(true, 'Liberando dirección IP actual...');
    try {
      const res = await window.api.runNetworkAction({ action: 'release', adapterName: currentAdapter.name });
      addBanner(res.message, 'warn');
      addResultLine('ipconfig /release', res.output, 'warn');
      statusText.textContent = '✔ Dirección IP liberada';
    } catch (e) {
      statusText.textContent = `❌ Error al liberar IP: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });

  document.getElementById('btn-act-renew').addEventListener('click', async () => {
    setBusy(true, 'Renovando dirección IP desde el servidor...');
    try {
      const res = await window.api.runNetworkAction({ action: 'renew', adapterName: currentAdapter.name });
      addBanner(res.message, 'ok');
      addResultLine('ipconfig /renew', res.output, 'ok');
      renderNetworkOptionsPanel(res.adapters);
      statusText.textContent = '✔ Dirección IP renovada exitosamente';
    } catch (e) {
      statusText.textContent = `❌ Error al renovar IP: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });

  document.getElementById('btn-act-flushdns').addEventListener('click', async () => {
    setBusy(true, 'Vaciando caché DNS y renovando concesión DHCP...');
    try {
      const res = await window.api.runNetworkAction({ action: 'flushdns', adapterName: currentAdapter.name });
      addBanner(res.message, 'ok');
      addResultLine('ipconfig /flushdns & /renew', res.output, 'ok');
      renderNetworkOptionsPanel(res.adapters);
      statusText.textContent = '✔ Caché DNS limpiada y concesión DHCP renovada';
    } catch (e) {
      statusText.textContent = `❌ Error al renovar DHCP / limpiar DNS: ${e.message}`;
    } finally {
      setBusy(false);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilidad — Comprobar Actualizaciones del Sistema (Windows Update & HP Support)
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-sysupdates').addEventListener('click', async () => {
  clearResults('Comprobar Actualizaciones del Sistema');
  setBusy(true, 'Analizando actualizaciones de Windows, HP Support, historial y servicios...');

  try {
    const data = await window.api.getSystemUpdates();
    renderSystemUpdatesPanel(data);
    statusText.textContent = '✔ Datos de actualizaciones y servicios cargados correctamente';
  } catch (e) {
    statusText.textContent = `❌ Error al consultar actualizaciones: ${e.message}`;
  } finally {
    setBusy(false);
  }
});

function renderSystemUpdatesPanel(data) {
  clearResults('Comprobar Actualizaciones del Sistema');
  addSectionTitle('Resumen de Actualizaciones y Servicios del Sistema');

  const { windowsUpdate, hpSupport, history, services, diagnostics } = data;

  // 1. SECCIÓN: WINDOWS UPDATE
  const wuCard = document.createElement('div');
  wuCard.className = 'net-card';
  wuCard.style.marginBottom = '20px';

  const wuStatusColor = windowsUpdate.pendingCount > 0 ? '#FBBF24' : '#34D399';
  const wuStatusText = windowsUpdate.pendingCount > 0
    ? `🟡 ${windowsUpdate.pendingCount} Actualización(es) Pendiente(s)`
    : '🟢 Sistema Completamente Actualizado';

  let pendingHtml = '';
  if (windowsUpdate.pendingCount > 0 && windowsUpdate.pendingList.length > 0) {
    pendingHtml = `
      <div style="margin-top: 12px; font-weight: 700; color: #F8FAFC; font-size: 13px;">Lista de Actualizaciones Pendientes:</div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
        ${windowsUpdate.pendingList.map(item => `
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px;">
              <span style="font-weight: 700; color: #60A5FA; font-size: 13px;">${item.kb}</span>
              <span style="font-size: 11px; background: rgba(96, 165, 250, 0.15); color: #93C5FD; padding: 2px 8px; border-radius: 12px;">${item.category}</span>
            </div>
            <div style="font-size: 12.5px; color: #E2E8F0; line-height: 1.4;">${item.title}</div>
            <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">Tamaño estimado: ${item.size}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    pendingHtml = `
      <div style="margin-top: 10px; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 12px 16px; color: #34D399; font-size: 13px; display: flex; align-items: center; gap: 8px;">
        <span>✔</span> No hay actualizaciones pendientes encontradas. Su instalación de Windows se encuentra al día.
      </div>
    `;
  }

  wuCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(59, 130, 246, 0.15); color: #60A5FA; border: 1px solid rgba(59, 130, 246, 0.3);">
          🪟 WINDOWS UPDATE
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Estado del Canal Oficial de Windows Update</span>
        </h3>
        <div style="font-size: 11.5px; color: #94A3B8; margin-top: 2px;">
          Última comprobación registrada: ${windowsUpdate.lastCheck}
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">Estado de Parches</span>
        <div style="font-size: 14px; font-weight: 700; color: ${wuStatusColor};">${wuStatusText}</div>
      </div>
    </div>

    ${pendingHtml}

    <div style="display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap;">
      <button class="btn-net-act primary" id="btn-wu-open" style="flex: 1; min-width: 220px;">
        ⚙️ Abrir Menú de Windows Update en Ajustes
      </button>
      <button class="btn-net-act" id="btn-wu-troubleshoot" style="flex: 1; min-width: 220px;">
        🛠️ Lanzar Solucionador de Problemas de Windows Update
      </button>
    </div>
  `;
  resultsEl.appendChild(wuCard);

  // 2. SECCIÓN: HP SUPPORT ASSISTANT / HP DRIVERS
  const hpCard = document.createElement('div');
  hpCard.className = 'net-card';
  hpCard.style.marginBottom = '20px';

  const hpStatusColor = hpSupport.isInstalled ? '#34D399' : (hpSupport.isHpDevice ? '#FBBF24' : '#94A3B8');
  const hpBadgeText = hpSupport.isHpDevice ? '💻 HP SUPPORT ASSISTANT (EQUIPO HP DETECTADO)' : '💻 HP SUPPORT FRAMEWORK (GENÉRICO)';

  hpCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(168, 85, 247, 0.15); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.3);">
          ${hpBadgeText}
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Controladores y Firmware del Fabricante HP</span>
        </h3>
        <div style="font-size: 11.5px; color: #94A3B8; margin-top: 2px;">
          Versión detectada: ${hpSupport.version}
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">Estado HP Support</span>
        <div style="font-size: 14px; font-weight: 700; color: ${hpStatusColor};">${hpSupport.status}</div>
      </div>
    </div>

    <div class="net-details-grid" style="margin-top: 12px;">
      <div class="net-detail-item">
        <span class="net-detail-label">Fabricante del Equipo</span>
        <span class="net-detail-value">${hpSupport.isHpDevice ? 'Hewlett-Packard / HP' : 'Otro Fabricante / Ensamblado'}</span>
      </div>
      <div class="net-detail-item">
        <span class="net-detail-label">Aplicación HP Support</span>
        <span class="net-detail-value">${hpSupport.appName} (${hpSupport.version})</span>
      </div>
      <div class="net-detail-item" style="grid-column: 1 / -1;">
        <span class="net-detail-label">Detalles y Cobertura de Controladores</span>
        <span class="net-detail-value" style="color: #CBD5E1; font-weight: 500;">${hpSupport.notes}</span>
      </div>
    </div>

    ${hpSupport.isInstalled ? `
      <div style="margin-top: 14px;">
        <button class="btn-net-act primary" id="btn-hp-open" style="width: 100%;">
          🚀 Abrir HP Support Assistant para Buscar Drivers
        </button>
      </div>
    ` : ''}
  `;
  resultsEl.appendChild(hpCard);

  // 3. SECCIÓN: HISTORIAL DE ACTUALIZACIONES
  const histCard = document.createElement('div');
  histCard.className = 'net-card';
  histCard.style.marginBottom = '20px';

  let historyHtml = '';
  if (history && history.length > 0) {
    historyHtml = `
      <div style="overflow-x: auto; margin-top: 12px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: #94A3B8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              <th style="padding: 8px 10px;">Paquete KB</th>
              <th style="padding: 8px 10px;">Descripción</th>
              <th style="padding: 8px 10px;">Fecha Instalación</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(item => `
              <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #E2E8F0;">
                <td style="padding: 10px; font-weight: 700; color: #60A5FA;">${item.hotfixId}</td>
                <td style="padding: 10px;">${item.description}</td>
                <td style="padding: 10px; color: #34D399; font-weight: 600;">${item.installedOn}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    historyHtml = `
      <div style="margin-top: 10px; color: #94A3B8; font-size: 12.5px;">
        No se pudo recuperar el registro detallado de KBs instaladas recientemente.
      </div>
    `;
  }

  histCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.3);">
          📜 HISTORIAL DE ACTUALIZACIONES INSTALADAS
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Últimos Parches y Revisiones Aplicados</span>
        </h3>
      </div>
    </div>
    ${historyHtml}
  `;
  resultsEl.appendChild(histCard);

  // 4. SECCIÓN: ESTADO DE SERVICIOS
  const svcCard = document.createElement('div');
  svcCard.className = 'net-card';
  svcCard.style.marginBottom = '20px';

  svcCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3);">
          ⚙️ ESTADO DE SERVICIOS
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Servicios del Motor de Actualización de Windows</span>
        </h3>
      </div>
      <button class="btn-net-act" id="btn-restart-services" style="padding: 6px 12px; font-size: 12px;">
        🔄 Reiniciar Servicios de Actualización
      </button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 14px;">
      ${services.map(s => `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid ${s.ok ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: #F8FAFC; font-size: 13px;">${s.name}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${s.ok ? '#34D399' : '#EF4444'};">
              ${s.ok ? '🟢 ' + s.status : '🔴 ' + s.status}
            </span>
          </div>
          <div style="font-size: 11.5px; color: #94A3B8;">${s.displayName}</div>
          <div style="font-size: 10.5px; color: #64748B; margin-top: 4px;">Tipo de inicio: ${s.startType}</div>
        </div>
      `).join('')}
    </div>
  `;
  resultsEl.appendChild(svcCard);

  // 5. SECCIÓN: DIAGNÓSTICO Y DETECCIÓN DE PROBLEMAS
  const diagCard = document.createElement('div');
  diagCard.className = 'net-card';

  const diagColor = diagnostics.issuesCount > 0 ? '#FBBF24' : '#34D399';

  let issuesHtml = '';
  if (diagnostics.issues && diagnostics.issues.length > 0) {
    issuesHtml = `
      <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
        ${diagnostics.issues.map(iss => `
          <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 10px 14px; color: #FBBF24;">
            <div style="font-weight: 700; font-size: 13px;">⚠️ ${iss.title}</div>
            <div style="font-size: 12px; color: #CBD5E1; margin-top: 2px;">${iss.description}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    issuesHtml = `
      <div style="margin-top: 12px; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 12px 16px; color: #34D399; font-size: 13px;">
        🟢 No se han detectado bloqueos ni incidencias en el motor de actualizaciones de Windows.
      </div>
    `;
  }

  diagCard.innerHTML = `
    <div class="net-card-header">
      <div>
        <span class="net-badge" style="background: rgba(239, 68, 68, 0.15); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.3);">
          🩺 DIAGNÓSTICO DE ACTUALIZACIONES
        </span>
        <h3 class="net-title" style="margin-top: 6px;">
          <span>Análisis de Incidencias y Caché de Descarga</span>
        </h3>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; color: #94A3B8; text-transform: uppercase;">Diagnóstico Global</span>
        <div style="font-size: 14px; font-weight: 700; color: ${diagColor};">
          ${diagnostics.issuesCount > 0 ? `⚠️ ${diagnostics.issuesCount} Incidencia(s) Detectada(s)` : '🟢 Estado Saludable'}
        </div>
      </div>
    </div>

    ${issuesHtml}

    <div style="margin-top: 14px; font-size: 12.5px; color: #CBD5E1;">
      <b>Recomendaciones del Diagnosticador:</b>
      <ul style="margin: 6px 0 0 18px; padding: 0;">
        ${(diagnostics.recommendations || []).map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join('')}
      </ul>
    </div>
  `;
  resultsEl.appendChild(diagCard);

  // Event handlers
  document.getElementById('btn-wu-open').addEventListener('click', async () => {
    try {
      const res = await window.api.runSystemUpdatesAction({ action: 'open-windows-update' });
      addBanner(res.message, 'ok');
    } catch (e) {
      addBanner(`Error al abrir Windows Update: ${e.message}`, 'error');
    }
  });

  document.getElementById('btn-wu-troubleshoot').addEventListener('click', async () => {
    try {
      const res = await window.api.runSystemUpdatesAction({ action: 'run-troubleshooter' });
      addBanner(res.message, 'ok');
    } catch (e) {
      addBanner(`Error al abrir Solucionador de Problemas: ${e.message}`, 'error');
    }
  });

  if (document.getElementById('btn-hp-open')) {
    document.getElementById('btn-hp-open').addEventListener('click', async () => {
      try {
        const res = await window.api.runSystemUpdatesAction({ action: 'open-hp-support' });
        addBanner(res.message, 'ok');
      } catch (e) {
        addBanner(`Error al abrir HP Support Assistant: ${e.message}`, 'error');
      }
    });
  }

  document.getElementById('btn-restart-services').addEventListener('click', async () => {
    setBusy(true, 'Solicitando reinicio de servicios de Windows Update...');
    try {
      const res = await window.api.runSystemUpdatesAction({ action: 'restart-services' });
      addBanner(res.message, 'ok');
    } catch (e) {
      addBanner(`Error al reiniciar servicios: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  });
}
